// Package sqlite is trckable's control plane: accounts, sites, settings and
// (from M3) the webhook inbox and payment ledger — the source of truth for
// money. It opens in milliseconds, so the HTTP listener can come up before
// the analytics store (plan §5.1 boot order).
package sqlite

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/ingest"
)

// Store wraps the control-plane database and an in-memory site cache.
type Store struct {
	DB *sql.DB

	mu         sync.RWMutex
	sites      map[string]ingest.Site
	reloadMu   sync.Mutex
	lastReload time.Time
}

// siteReloadEvery bounds how often a cache miss may hit the database, so
// traffic with bogus site ids cannot hammer SQLite.
const siteReloadEvery = 2 * time.Second

// DefaultAccount owns every site on a self-hosted instance. trckable Cloud
// will create one account per customer (plan §11b).
const DefaultAccount = "acc_default"

// Open opens the database with durable settings and runs migrations.
func Open(ctx context.Context, path string) (*Store, error) {
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=synchronous(FULL)" +
		"&_pragma=busy_timeout(5000)&_pragma=foreign_keys(ON)&_txlock=immediate"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(4)
	s := &Store{DB: db, sites: map[string]ingest.Site{}}
	if err := s.migrate(ctx); err != nil {
		db.Close()
		return nil, err
	}
	if err := s.reloadSites(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

var migrations = []string{
	// 1: accounts, sites, key/value meta, daily salts
	`CREATE TABLE accounts (
		id         TEXT PRIMARY KEY,
		created_at INTEGER NOT NULL
	);
	CREATE TABLE sites (
		id         TEXT PRIMARY KEY,
		account_id TEXT NOT NULL REFERENCES accounts(id),
		domain     TEXT NOT NULL,
		name       TEXT NOT NULL,
		timezone   TEXT NOT NULL DEFAULT 'UTC',
		currency   TEXT NOT NULL DEFAULT 'USD',
		allowed    TEXT NOT NULL DEFAULT '',
		hash_mode  INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL
	);
	CREATE UNIQUE INDEX sites_account_domain ON sites(account_id, domain);
	CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
	CREATE TABLE daily_salts (day TEXT PRIMARY KEY, salt BLOB NOT NULL);`,
	// 2: per-site proxy key (same-origin proxies prove themselves with it)
	`ALTER TABLE sites ADD COLUMN proxy_key TEXT NOT NULL DEFAULT '';
	UPDATE sites SET proxy_key = 'tkb_px_' || lower(hex(randomblob(16))) WHERE proxy_key = '';`,
	// 3: accounts — users, login sessions and API keys (secrets stored hashed)
	`CREATE TABLE users (
		id            TEXT PRIMARY KEY,
		account_id    TEXT NOT NULL REFERENCES accounts(id),
		email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
		password_hash TEXT NOT NULL,
		role          TEXT NOT NULL DEFAULT 'owner',
		created_at    INTEGER NOT NULL
	);
	CREATE TABLE auth_sessions (
		token_hash BLOB PRIMARY KEY,
		user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		created_at INTEGER NOT NULL,
		expires_at INTEGER NOT NULL
	);
	CREATE TABLE api_keys (
		id           TEXT PRIMARY KEY,
		account_id   TEXT NOT NULL REFERENCES accounts(id),
		name         TEXT NOT NULL,
		prefix       TEXT NOT NULL,
		key_hash     BLOB NOT NULL UNIQUE,
		created_at   INTEGER NOT NULL,
		last_used_at INTEGER,
		revoked_at   INTEGER
	);`,
	// 4: payments — provider connections, the raw webhook inbox (the ledger
	// can always be rebuilt from it), the ledger itself and FX rates.
	`CREATE TABLE pay_connections (
		id              TEXT PRIMARY KEY,
		site_id         TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
		provider        TEXT NOT NULL,
		mode            TEXT NOT NULL DEFAULT 'live',      -- live | test (sandbox APIs)
		label           TEXT NOT NULL DEFAULT '',
		api_key_enc     TEXT NOT NULL DEFAULT '',
		secret_enc      TEXT NOT NULL DEFAULT '',          -- webhook signing secret
		remote_id       TEXT NOT NULL DEFAULT '',          -- webhook endpoint id at the provider
		account_ref     TEXT NOT NULL DEFAULT '',          -- store / organization id when the API needs it
		created_at      INTEGER NOT NULL,
		last_event_at   INTEGER,
		last_test_at    INTEGER,
		last_sync_at    INTEGER,
		last_error      TEXT NOT NULL DEFAULT '',
		disabled_at     INTEGER                             -- disconnected: history stays, webhooks stop
	);
	CREATE INDEX pay_connections_site ON pay_connections(site_id);
	CREATE TABLE pay_inbox (
		id            INTEGER PRIMARY KEY,
		connection_id TEXT NOT NULL REFERENCES pay_connections(id),
		event_key     TEXT NOT NULL,
		received_at   INTEGER NOT NULL,
		source        TEXT NOT NULL DEFAULT 'webhook',      -- webhook | sync
		body          BLOB NOT NULL,
		processed_at  INTEGER,
		error         TEXT NOT NULL DEFAULT '',
		UNIQUE (connection_id, event_key)
	);
	CREATE INDEX pay_inbox_pending ON pay_inbox(processed_at) WHERE processed_at IS NULL;
	CREATE TABLE pay_payments (
		site_id         TEXT NOT NULL,
		provider        TEXT NOT NULL,
		id              TEXT NOT NULL,
		connection_id   TEXT NOT NULL,
		test            INTEGER NOT NULL DEFAULT 0,
		paid_at         INTEGER NOT NULL,
		currency        TEXT NOT NULL,
		gross           INTEGER NOT NULL,
		tax             INTEGER,
		customer_id     TEXT NOT NULL DEFAULT '',
		subscription_id TEXT NOT NULL DEFAULT '',
		email_hash      TEXT NOT NULL DEFAULT '',
		visitor_id      INTEGER NOT NULL DEFAULT 0,
		kind            TEXT NOT NULL DEFAULT 'one_time',
		version         INTEGER NOT NULL,
		PRIMARY KEY (site_id, provider, id)
	);
	CREATE INDEX pay_payments_time ON pay_payments(site_id, paid_at);
	CREATE INDEX pay_payments_sub ON pay_payments(site_id, subscription_id) WHERE subscription_id <> '';
	CREATE TABLE pay_hints (
		site_id         TEXT NOT NULL,
		provider        TEXT NOT NULL,
		payment_id      TEXT NOT NULL,
		source          TEXT NOT NULL,
		tax             INTEGER,
		visitor_id      INTEGER NOT NULL DEFAULT 0,
		customer_id     TEXT NOT NULL DEFAULT '',
		subscription_id TEXT NOT NULL DEFAULT '',
		kind            TEXT NOT NULL DEFAULT '',
		version         INTEGER NOT NULL,
		PRIMARY KEY (site_id, provider, payment_id, source)
	);
	CREATE INDEX pay_hints_payment ON pay_hints(site_id, payment_id);
	CREATE INDEX pay_hints_sub ON pay_hints(site_id, subscription_id) WHERE subscription_id <> '';
	-- another id for the same payment (Stripe: invoice -> PaymentIntent), so
	-- hints keyed by either id reach it
	CREATE TABLE pay_aliases (
		site_id    TEXT NOT NULL,
		provider   TEXT NOT NULL,
		alias      TEXT NOT NULL,
		payment_id TEXT NOT NULL,
		PRIMARY KEY (site_id, provider, alias)
	);
	CREATE INDEX pay_aliases_payment ON pay_aliases(site_id, payment_id);
	CREATE TABLE pay_refunds (
		site_id    TEXT NOT NULL,
		provider   TEXT NOT NULL,
		id         TEXT NOT NULL,
		payment_id TEXT NOT NULL,
		amount     INTEGER NOT NULL,
		currency   TEXT NOT NULL,
		status     TEXT NOT NULL,
		cumulative INTEGER NOT NULL DEFAULT 0,
		at         INTEGER NOT NULL,
		version    INTEGER NOT NULL,
		PRIMARY KEY (site_id, provider, id)
	);
	CREATE INDEX pay_refunds_payment ON pay_refunds(site_id, payment_id);
	CREATE TABLE pay_disputes (
		site_id    TEXT NOT NULL,
		provider   TEXT NOT NULL,
		id         TEXT NOT NULL,
		payment_id TEXT NOT NULL,
		amount     INTEGER NOT NULL,
		currency   TEXT NOT NULL,
		status     TEXT NOT NULL,
		at         INTEGER NOT NULL,
		version    INTEGER NOT NULL,
		PRIMARY KEY (site_id, provider, id)
	);
	CREATE INDEX pay_disputes_payment ON pay_disputes(site_id, payment_id);
	CREATE TABLE pay_links (
		site_id    TEXT NOT NULL,
		provider   TEXT NOT NULL,
		kind       TEXT NOT NULL,     -- cus | sub
		key        TEXT NOT NULL,
		visitor_id INTEGER NOT NULL,
		version    INTEGER NOT NULL,  -- first link wins: the visitor who started it
		PRIMARY KEY (site_id, provider, kind, key)
	);
	CREATE INDEX pay_links_key ON pay_links(site_id, key);
	CREATE TABLE fx_rates (
		day      TEXT NOT NULL,       -- YYYY-MM-DD
		currency TEXT NOT NULL,
		per_eur  REAL NOT NULL,       -- units of currency per 1 EUR (ECB reference rate)
		PRIMARY KEY (day, currency)
	);`,
	// 5: which modules each site has on (absent means the module's default)
	`CREATE TABLE site_modules (
		site_id    TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
		module_id  TEXT NOT NULL,
		enabled    INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		PRIMARY KEY (site_id, module_id)
	);
	CREATE INDEX site_modules_module ON site_modules(module_id, enabled);`,
	// 6: per-site configuration: what to skip, what to record, how long to keep
	`CREATE TABLE site_settings (
		site_id        TEXT PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
		exclude_paths  TEXT NOT NULL DEFAULT '',    -- one glob per line, e.g. /admin/*
		honor_dnt      INTEGER NOT NULL DEFAULT 0,  -- drop visits from DNT / GPC browsers
		record_city    INTEGER NOT NULL DEFAULT 1,  -- country is always recorded, city is a choice
		retention_days INTEGER NOT NULL DEFAULT 0,  -- 0 keeps everything
		week_start     INTEGER NOT NULL DEFAULT 1,  -- 1 Monday, 0 Sunday
		bot_strict     INTEGER NOT NULL DEFAULT 0,  -- also drop headless and unknown clients
		updated_at     INTEGER NOT NULL
	);`,
	// 7: when each site last sent an event, so the dashboard can say which
	// sites are live without scanning the analytics store
	`ALTER TABLE sites ADD COLUMN last_event_at INTEGER NOT NULL DEFAULT 0;`,
	// 8: who you are — a display name and a small picture, kept here so no
	// avatar service ever sees an email address
	`ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT '';
	ALTER TABLE users ADD COLUMN avatar BLOB;
	ALTER TABLE users ADD COLUMN avatar_type TEXT NOT NULL DEFAULT '';`,
	// 9: consent-free mode — analytics a European site can run without a
	// cookie banner, enforced by the server rather than promised by the docs
	`ALTER TABLE site_settings ADD COLUMN consent_free INTEGER NOT NULL DEFAULT 0;`,
	// 10: notes on the chart — "we shipped this", "this went out", so a spike
	// keeps its reason long after everyone has forgotten it
	`CREATE TABLE annotations (
		id         TEXT PRIMARY KEY,
		site_id    TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
		day        TEXT NOT NULL,          -- YYYY-MM-DD in the site's timezone
		text       TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);
	CREATE INDEX annotations_site_day ON annotations(site_id, day);`,
	// 11: segments — a filtered view worth keeping, by name
	`CREATE TABLE segments (
		id         TEXT PRIMARY KEY,
		site_id    TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
		name       TEXT NOT NULL,
		query      TEXT NOT NULL,          -- the dashboard's own URL query
		created_at INTEGER NOT NULL
	);
	CREATE INDEX segments_site ON segments(site_id);`,
	// 12: alerts — the four things worth waking up for, delivered to a webhook
	`CREATE TABLE alerts (
		id         TEXT PRIMARY KEY,
		site_id    TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
		kind       TEXT NOT NULL,          -- stopped | spike | customer | disk
		enabled    INTEGER NOT NULL DEFAULT 1,
		target     TEXT NOT NULL,          -- https webhook URL
		threshold  REAL NOT NULL DEFAULT 0,
		last_fired INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL
	);
	CREATE INDEX alerts_site ON alerts(site_id);`,
	// 13: two-step sign-in (TOTP), and the codes that get you back in
	`ALTER TABLE users ADD COLUMN totp_secret TEXT NOT NULL DEFAULT '';
	ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
	ALTER TABLE users ADD COLUMN recovery TEXT NOT NULL DEFAULT '';`,
	// 14: a read-only link to one site's numbers, for people with no account.
	// Only the token's hash is kept, like every other secret here.
	`CREATE TABLE site_shares (
		id          TEXT PRIMARY KEY,
		site_id     TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
		name        TEXT NOT NULL DEFAULT '',
		token_hash  TEXT NOT NULL UNIQUE,
		pass_hash   TEXT NOT NULL DEFAULT '',
		revenue     INTEGER NOT NULL DEFAULT 0,
		expires_at  INTEGER,
		created_at  INTEGER NOT NULL,
		viewed_at   INTEGER,
		views       INTEGER NOT NULL DEFAULT 0
	);
	CREATE INDEX site_shares_site ON site_shares(site_id);
	-- Opening a protected link once trades the password for one of these, so
	-- the password is checked once rather than on every report.
	CREATE TABLE share_sessions (
		token_hash TEXT PRIMARY KEY,
		share_id   TEXT NOT NULL REFERENCES site_shares(id) ON DELETE CASCADE,
		expires_at INTEGER NOT NULL
	);`,
	// 15: content groups — "Blog", "Docs", "Pricing" — so a site is read by
	// section and not by four hundred URLs. One "Name = /glob" per line.
	`ALTER TABLE site_settings ADD COLUMN groups TEXT NOT NULL DEFAULT '';`,
	// 16: the wording of trckable's own cookie bar, so a German site asks in
	// German. Empty means the built-in English.
	`ALTER TABLE site_settings ADD COLUMN banner TEXT NOT NULL DEFAULT '';`,
	// 17: Google Search Console — which searches showed the site. A service
	// account key, encrypted like the payment keys, and the property it reads.
	`CREATE TABLE search_console (
		site_id      TEXT PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
		key_enc      TEXT NOT NULL,              -- the service account's JSON key, sealed
		client_email TEXT NOT NULL,              -- shown so you know which account to add in Google
		property     TEXT NOT NULL DEFAULT '',   -- https://example.com/ or sc-domain:example.com
		created_at   INTEGER NOT NULL,
		last_ok_at   INTEGER,
		last_error   TEXT NOT NULL DEFAULT ''
	);`,
	// 18: goals that are pages — "Saw pricing = /pricing" — counted from the
	// pageviews already recorded, so a new one reads history too.
	`ALTER TABLE site_settings ADD COLUMN page_goals TEXT NOT NULL DEFAULT '';`,
	// 19: the sites a share link may be embedded on (one origin per line).
	// Empty means nowhere: the page refuses to be framed, as before.
	`ALTER TABLE site_shares ADD COLUMN embed_origins TEXT NOT NULL DEFAULT '';`,
	// 20: when each person last used the dashboard — signed in, not an API
	// key or a share link. Hourly at most, so it costs nothing.
	`ALTER TABLE users ADD COLUMN last_seen_at INTEGER NOT NULL DEFAULT 0;`,
	// 21: one-time sign-in links an operator asks for on an owner's behalf
	// (a hosting provider's "open dashboard"). Kept hashed, used once, and
	// gone within a minute.
	`CREATE TABLE signin_links (
		token_hash BLOB PRIMARY KEY,
		user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		expires_at INTEGER NOT NULL
	);`,
}

func (s *Store) migrate(ctx context.Context) error {
	var v int
	if err := s.DB.QueryRowContext(ctx, `PRAGMA user_version`).Scan(&v); err != nil {
		return err
	}
	if v > len(migrations) {
		return fmt.Errorf("sqlite schema version %d is newer than this binary (%d): refusing to start (downgrade guard)", v, len(migrations))
	}
	for i := v; i < len(migrations); i++ {
		tx, err := s.DB.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, migrations[i]); err != nil {
			tx.Rollback()
			return fmt.Errorf("sqlite migration %d: %w", i+1, err)
		}
		if _, err := tx.ExecContext(ctx, fmt.Sprintf(`PRAGMA user_version = %d`, i+1)); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	_, err := s.DB.ExecContext(ctx,
		`INSERT OR IGNORE INTO accounts (id, created_at) VALUES (?, ?)`, DefaultAccount, time.Now().Unix())
	return err
}

// Site implements ingest.Sites from the in-memory cache. On a miss it reloads
// from the database (at most every siteReloadEvery), so sites created by
// another process — the CLI, or a future cloud provisioner — work immediately.
func (s *Store) Site(id string) (ingest.Site, bool) {
	s.mu.RLock()
	site, ok := s.sites[id]
	s.mu.RUnlock()
	if ok || !strings.HasPrefix(id, "tkb_") {
		return site, ok
	}
	s.reloadMu.Lock()
	if time.Since(s.lastReload) >= siteReloadEvery {
		if err := s.reloadSites(context.Background()); err == nil {
			s.lastReload = time.Now()
		}
	}
	s.reloadMu.Unlock()
	s.mu.RLock()
	defer s.mu.RUnlock()
	site, ok = s.sites[id]
	return site, ok
}

func (s *Store) reloadSites(ctx context.Context) error {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT s.id, s.domain, s.allowed, s.hash_mode, s.proxy_key,
		       coalesce(c.exclude_paths, ''), coalesce(c.honor_dnt, 0),
		       coalesce(c.record_city, 1), coalesce(c.bot_strict, 0),
		       coalesce(c.consent_free, 0)
		FROM sites s LEFT JOIN site_settings c ON c.site_id = s.id`)
	if err != nil {
		return err
	}
	defer rows.Close()
	next := map[string]ingest.Site{}
	for rows.Next() {
		var site ingest.Site
		var allowed, exclude string
		var hash, dnt, city, strict, free int
		if err := rows.Scan(&site.ID, &site.Domain, &allowed, &hash, &site.ProxyKey, &exclude, &dnt, &city, &strict, &free); err != nil {
			return err
		}
		if allowed != "" {
			site.Allowed = strings.Split(allowed, ",")
		}
		site.HashMode = hash == 1
		site.HonorDNT = dnt == 1
		site.NoCity = city == 0
		site.BotStrict = strict == 1
		site.ConsentFree = free == 1
		if site.ConsentFree {
			// Consent-free is not a suggestion: the server stops storing the
			// city and honours DNT whatever the other switches say.
			site.NoCity, site.HonorDNT = true, true
		}
		for _, line := range strings.Split(exclude, "\n") {
			if line = strings.TrimSpace(line); line != "" {
				site.ExcludePaths = append(site.ExcludePaths, line)
			}
		}
		next[site.ID] = site
	}
	if err := rows.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	s.sites = next
	s.mu.Unlock()
	return nil
}

// SiteRow is a site as listed to admins.
type SiteRow struct {
	ID, Domain, Name, Timezone, Currency, ProxyKey string
	LastEventAt                                    int64
}

// SeenSite records that a site just sent an event. Called at most once a
// minute per site by the ingest handler, so it costs nothing.
func (s *Store) SeenSite(ctx context.Context, site string, at int64) {
	s.DB.ExecContext(ctx, `UPDATE sites SET last_event_at = ? WHERE id = ? AND last_event_at < ?`, at, site, at)
}

var ErrExists = errors.New("site already exists")

// CreateSite adds a site to an account and returns its id (tkb_…).
func (s *Store) CreateSite(ctx context.Context, account, domain, name string) (string, error) {
	domain = normalizeDomain(domain)
	if domain == "" || strings.ContainsAny(domain, " /") {
		return "", errors.New("invalid domain")
	}
	if name == "" {
		name = domain
	}
	id := NewSiteID()
	_, err := s.DB.ExecContext(ctx,
		`INSERT INTO sites (id, account_id, domain, name, created_at, proxy_key) VALUES (?, ?, ?, ?, ?, ?)`,
		id, account, domain, name, time.Now().Unix(), NewProxyKey())
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return "", ErrExists
		}
		return "", err
	}
	return id, s.reloadSites(ctx)
}

// DeleteSite removes a site and everything the control plane holds about it:
// modules, payment connections and their inbox, ledger and links. The
// analytics rows live in DuckDB and are purged separately, by the writer (it
// owns the only write connection).
func (s *Store) DeleteSite(ctx context.Context, id string) (Removed, error) {
	var out Removed
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return out, err
	}
	defer tx.Rollback()
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM sites WHERE id = ?`, id).Scan(&n); err != nil {
		return out, err
	}
	if n == 0 {
		return out, auth.ErrNotFound
	}
	// Counted before they go, so the dashboard can say what was removed.
	tx.QueryRowContext(ctx, `SELECT count(*) FROM pay_payments WHERE site_id = ?`, id).Scan(&out.Payments)
	tx.QueryRowContext(ctx, `SELECT count(*) FROM pay_connections WHERE site_id = ?`, id).Scan(&out.Connections)
	// The inbox hangs off connections, and money tables carry site_id without
	// a foreign key, so they are cleared by hand before the cascade.
	stmts := []string{
		`DELETE FROM pay_inbox WHERE connection_id IN (SELECT id FROM pay_connections WHERE site_id = ?)`,
		`DELETE FROM pay_payments WHERE site_id = ?`,
		`DELETE FROM pay_hints WHERE site_id = ?`,
		`DELETE FROM pay_aliases WHERE site_id = ?`,
		`DELETE FROM pay_refunds WHERE site_id = ?`,
		`DELETE FROM pay_disputes WHERE site_id = ?`,
		`DELETE FROM pay_links WHERE site_id = ?`,
		`DELETE FROM pay_connections WHERE site_id = ?`,
		`DELETE FROM site_modules WHERE site_id = ?`,
		`DELETE FROM sites WHERE id = ?`,
	}
	for _, q := range stmts {
		if _, err := tx.ExecContext(ctx, q, id); err != nil {
			return out, err
		}
	}
	if err := tx.Commit(); err != nil {
		return out, err
	}
	return out, s.reloadSites(ctx)
}

// Removed is what deleting a site took with it, for the dashboard to show.
type Removed struct {
	Events   int64 `json:"events"`
	Sessions int64 `json:"sessions"`
	Payments int64 `json:"payments"`

	Connections int64 `json:"connections"`
}

// EnsureSite returns the id of the account's site for domain, creating it if
// needed.
func (s *Store) EnsureSite(ctx context.Context, account, domain string) (id string, created bool, err error) {
	id, err = s.CreateSite(ctx, account, domain, "")
	if err == nil {
		return id, true, nil
	}
	if err != ErrExists {
		return "", false, err
	}
	norm := normalizeDomain(domain)
	err = s.DB.QueryRowContext(ctx, `SELECT id FROM sites WHERE account_id = ? AND domain = ?`, account, norm).Scan(&id)
	return id, false, err
}

// ListSites returns one account's sites. Anything a customer can reach lists
// sites through this.
func (s *Store) ListSites(ctx context.Context, account string) ([]SiteRow, error) {
	return s.listSites(ctx, `WHERE account_id = ?`, account)
}

// AllSites returns every site in the installation, for the installation's own
// tools and jobs: never for a customer's request.
func (s *Store) AllSites(ctx context.Context) ([]SiteRow, error) {
	return s.listSites(ctx, ``)
}

func (s *Store) listSites(ctx context.Context, where string, args ...any) ([]SiteRow, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, domain, name, timezone, currency, proxy_key, last_event_at FROM sites `+where+` ORDER BY created_at`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SiteRow
	for rows.Next() {
		var r SiteRow
		if err := rows.Scan(&r.ID, &r.Domain, &r.Name, &r.Timezone, &r.Currency, &r.ProxyKey, &r.LastEventAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// DailySalt implements ingest.SaltStore: the first salt stored for a day wins,
// and salts older than two days are deleted.
func (s *Store) DailySalt(day string, fresh []byte) ([]byte, error) {
	ctx := context.Background()
	if _, err := s.DB.ExecContext(ctx, `INSERT OR IGNORE INTO daily_salts (day, salt) VALUES (?, ?)`, day, fresh); err != nil {
		return nil, err
	}
	var salt []byte
	if err := s.DB.QueryRowContext(ctx, `SELECT salt FROM daily_salts WHERE day = ?`, day).Scan(&salt); err != nil {
		return nil, err
	}
	cutoff := time.Now().UTC().AddDate(0, 0, -2).Format("2006-01-02")
	_, _ = s.DB.ExecContext(ctx, `DELETE FROM daily_salts WHERE day < ?`, cutoff)
	return salt, nil
}

// Ping reports whether the database is usable.
func (s *Store) Ping(ctx context.Context) error { return s.DB.PingContext(ctx) }

// Close closes the database.
func (s *Store) Close() error { return s.DB.Close() }

// normalizeDomain accepts whatever people paste ("https://www.Example.com/"):
// scheme first, then "www.", then any path — events arrive as bare hostnames.
func normalizeDomain(domain string) string {
	domain = strings.ToLower(strings.TrimSpace(domain))
	domain = strings.TrimPrefix(strings.TrimPrefix(domain, "https://"), "http://")
	domain = strings.TrimPrefix(domain, "www.")
	if i := strings.IndexByte(domain, '/'); i >= 0 {
		domain = domain[:i]
	}
	return domain
}

var b32 = base32.NewEncoding("abcdefghijklmnopqrstuvwxyz234567").WithPadding(base32.NoPadding)

// NewProxyKey returns a per-site secret that same-origin proxies send in
// X-Trckable-Proxy-Key to be trusted with the visitor's IP and cookie.
func NewProxyKey() string {
	b := make([]byte, 16)
	rand.Read(b)
	return fmt.Sprintf("tkb_px_%x", b)
}

// NewSiteID returns "tkb_" + 12 lowercase base32 chars.
func NewSiteID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return "tkb_" + b32.EncodeToString(b)[:12]
}

// SiteAccount is the account a site belongs to.
func (s *Store) SiteAccount(ctx context.Context, site string) (string, error) {
	var account string
	err := s.DB.QueryRowContext(ctx, `SELECT account_id FROM sites WHERE id = ?`, site).Scan(&account)
	if errors.Is(err, sql.ErrNoRows) {
		return "", auth.ErrNotFound
	}
	return account, err
}
