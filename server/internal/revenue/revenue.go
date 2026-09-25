// Package revenue runs payment attribution: provider connections, the
// webhook endpoint, the inbox → ledger processor, reconciliation and FX.
//
// Webhook path: verify signature → fsync the raw body into the SQLite inbox
// → 200. Only then is it parsed into the ledger (in the background, and
// again at any time with Reprocess). A missing or wrong encryption key
// answers 503, so providers retry instead of dropping money.
package revenue

import (
	"context"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/fx"
	"github.com/trckable/trckable/server/internal/ledger"
	"github.com/trckable/trckable/server/internal/payments"
	"github.com/trckable/trckable/server/internal/secrets"
)

// Service is the revenue subsystem.
type Service struct {
	DB    *sql.DB
	Box   *secrets.Box
	Rates *fx.Rates
	Now   func() time.Time

	KeyErr   error             // set when the encryption key doesn't match the stored data
	OnChange func(site string) // called after a site's ledger changed (report caches)
	// OnSale is told about a payment the moment it is committed: new, real
	// (not test mode) and recent, so a dashboard can show it arriving. A
	// webhook replayed for a payment already in the ledger, or a sync that
	// backfills last month, announces nothing.
	OnSale func(site string, s Sale)

	emailKey []byte
	wake     chan struct{}
	bad      badSigs    // invalid signatures per connection
	mu       sync.Mutex // serialises ledger writes (processor, reprocess)
}

// New creates the service and checks the encryption key.
func New(ctx context.Context, db *sql.DB, box *secrets.Box) (*Service, error) {
	s := &Service{DB: db, Box: box, Rates: &fx.Rates{DB: db}, Now: time.Now, wake: make(chan struct{}, 1), emailKey: box.Derive("email hash v1")}
	var kcv string
	err := db.QueryRowContext(ctx, `SELECT value FROM meta WHERE key = 'secret_kcv'`).Scan(&kcv)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		if _, err := db.ExecContext(ctx, `INSERT INTO meta (key, value) VALUES ('secret_kcv', ?)`, box.KCV()); err != nil {
			return nil, err
		}
	case err != nil:
		return nil, err
	case kcv != box.KCV():
		s.KeyErr = secrets.ErrWrongKey
		slog.Error("payments disabled: the encryption key changed; restore TRCKABLE_SECRET (or data/secret.key) — webhooks answer 503 so providers retry")
	}
	return s, nil
}

// Connection is a provider account connected to a site.
type Connection struct {
	ID         string `json:"id"`
	Site       string `json:"site_id"`
	Provider   string `json:"provider"`
	Mode       string `json:"mode"`
	Label      string `json:"label"`
	Managed    bool   `json:"managed"` // trckable created the webhook with the API key
	WebhookURL string `json:"webhook_url"`
	CreatedAt  int64  `json:"created_at"`
	LastEvent  *int64 `json:"last_event_at,omitempty"`
	LastTest   *int64 `json:"last_test_event_at,omitempty"`
	LastSync   *int64 `json:"last_sync_at,omitempty"`
	LastError  string `json:"last_error,omitempty"`
	Pending    int    `json:"pending"`
	Payments   int    `json:"payments"`
	HasSecret  bool   `json:"has_secret"`

	apiKey, secret, remoteID, accountRef string
}

func (c Connection) setup() payments.Setup {
	return payments.Setup{RemoteID: c.remoteID, Secret: c.secret, AccountRef: c.accountRef}
}

// HookPath is where a connection's webhooks arrive.
func HookPath(provider, id string) string { return "/webhooks/" + provider + "/" + id }

func (s *Service) scan(rows interface{ Scan(...any) error }, base string, decrypt bool) (Connection, error) {
	var c Connection
	var keyEnc, secEnc string
	if err := rows.Scan(&c.ID, &c.Site, &c.Provider, &c.Mode, &c.Label, &keyEnc, &secEnc, &c.remoteID, &c.accountRef,
		&c.CreatedAt, &c.LastEvent, &c.LastTest, &c.LastSync, &c.LastError, &c.Pending, &c.Payments); err != nil {
		return c, err
	}
	c.Managed = keyEnc != "" && c.remoteID != ""
	c.HasSecret = secEnc != ""
	c.WebhookURL = strings.TrimSuffix(base, "/") + HookPath(c.Provider, c.ID)
	if decrypt {
		if s.KeyErr != nil {
			return c, s.KeyErr
		}
		var err error
		if c.apiKey, err = s.Box.Open(keyEnc); err != nil {
			return c, err
		}
		if c.secret, err = s.Box.Open(secEnc); err != nil {
			return c, err
		}
	}
	return c, nil
}

const connCols = `c.id, c.site_id, c.provider, c.mode, c.label, c.api_key_enc, c.secret_enc, c.remote_id, c.account_ref,
	c.created_at, c.last_event_at, c.last_test_at, c.last_sync_at, c.last_error,
	(SELECT count(*) FROM pay_inbox i WHERE i.connection_id = c.id AND i.processed_at IS NULL),
	(SELECT count(*) FROM pay_payments p WHERE p.connection_id = c.id AND p.test = 0)`

// Connections lists a site's active connections.
func (s *Service) Connections(ctx context.Context, site, base string) ([]Connection, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT `+connCols+` FROM pay_connections c WHERE c.site_id = ? AND c.disabled_at IS NULL ORDER BY c.created_at`, site)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Connection{}
	for rows.Next() {
		c, err := s.scan(rows, base, false)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Service) connection(ctx context.Context, id string, decrypt bool) (Connection, error) {
	row := s.DB.QueryRowContext(ctx, `SELECT `+connCols+` FROM pay_connections c WHERE c.id = ? AND c.disabled_at IS NULL`, id)
	c, err := s.scan(row, "", decrypt)
	if errors.Is(err, sql.ErrNoRows) {
		return c, auth.ErrNotFound
	}
	return c, err
}

// ConnectRequest creates a connection. With APIKey, trckable creates the
// webhook itself (one-key setup) and backfills recent payments; without it,
// the owner pastes the signing secret from the provider's dashboard.
type ConnectRequest struct {
	Site, Provider, Mode, APIKey, Secret string
	PublicBase                           string // https://stats.example.com, reachable by the provider
}

// Connect adds a provider to a site.
func (s *Service) Connect(ctx context.Context, r ConnectRequest) (Connection, error) {
	if s.KeyErr != nil {
		return Connection{}, s.KeyErr
	}
	if _, ok := payments.Registry[r.Provider]; !ok {
		return Connection{}, fmt.Errorf("unknown provider %q", r.Provider)
	}
	r.APIKey, r.Secret = strings.TrimSpace(r.APIKey), strings.TrimSpace(r.Secret)
	if r.Mode != "test" {
		r.Mode = "live"
	}
	id := auth.Token("pc_", 10)
	hook := strings.TrimSuffix(r.PublicBase, "/") + HookPath(r.Provider, id)
	var st payments.Setup
	switch {
	case r.APIKey != "":
		if u, err := url.Parse(r.PublicBase); err != nil || u.Scheme != "https" || isLocal(u.Hostname()) {
			return Connection{}, fmt.Errorf("the provider must reach %s: set TRCKABLE_BASE_URL to this server's public https address, or paste the signing secret instead", hook)
		}
		var err error
		st, err = payments.Remotes[r.Provider].Setup(ctx, r.APIKey, r.Mode == "test", hook)
		if err != nil {
			return Connection{}, fmt.Errorf("couldn't create the webhook: %w", err)
		}
		if st.Test {
			r.Mode = "test"
		}
	case (r.Provider == "lemonsqueezy" || r.Provider == "custom") && r.Secret == "":
		// Both ends have to agree on a secret and neither provider hands one
		// out: trckable makes it, and the owner pastes it into Lemon Squeezy,
		// or into the code that will send the webhook.
		r.Secret = auth.Token("whsec_", 20)
		fallthrough
	default:
		st = payments.Setup{Secret: r.Secret, Label: providerTitle(r.Provider)}
	}
	keyEnc, err := s.Box.Seal(r.APIKey)
	if err != nil {
		return Connection{}, err
	}
	secEnc, err := s.Box.Seal(st.Secret)
	if err != nil {
		return Connection{}, err
	}
	if _, err := s.DB.ExecContext(ctx, `INSERT INTO pay_connections (id, site_id, provider, mode, label, api_key_enc, secret_enc, remote_id, account_ref, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, r.Site, r.Provider, r.Mode, st.Label, keyEnc, secEnc, st.RemoteID, st.AccountRef, s.Now().Unix()); err != nil {
		return Connection{}, err
	}
	c, err := s.connection(ctx, id, false)
	c.WebhookURL = hook
	if r.APIKey != "" {
		go s.Sync(context.Background(), id, 90*24*time.Hour) // backfill
	}
	return c, err
}

// SetSecret stores the signing secret of a manual connection (the owner
// creates the webhook in the provider dashboard with our URL, then pastes
// the secret the provider shows).
func (s *Service) SetSecret(ctx context.Context, site, id, secret string) error {
	if s.KeyErr != nil {
		return s.KeyErr
	}
	secret = strings.TrimSpace(secret)
	if len(secret) < 6 {
		return errors.New("that doesn't look like a signing secret")
	}
	enc, err := s.Box.Seal(secret)
	if err != nil {
		return err
	}
	res, err := s.DB.ExecContext(ctx, `UPDATE pay_connections SET secret_enc = ? WHERE id = ? AND site_id = ? AND disabled_at IS NULL AND api_key_enc = ''`, enc, id, site)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrNotFound
	}
	return nil
}

// Secret returns a manual connection's signing secret (Lemon Squeezy lets
// the owner paste one that trckable generated).
func (s *Service) Secret(ctx context.Context, id string) (string, error) {
	c, err := s.connection(ctx, id, true)
	return c.secret, err
}

// Disconnect stops a connection: its webhook is removed at the provider
// when trckable created it, history stays in the ledger.
func (s *Service) Disconnect(ctx context.Context, site, id string) error {
	c, err := s.connection(ctx, id, s.KeyErr == nil)
	if err != nil || c.Site != site {
		return auth.ErrNotFound
	}
	if c.apiKey != "" && c.remoteID != "" {
		if err := payments.Remotes[c.Provider].Teardown(ctx, c.apiKey, c.Mode == "test", c.setup()); err != nil {
			slog.Warn("payments: couldn't delete the provider webhook (delete it in the provider dashboard)", "provider", c.Provider, "err", err)
		}
	}
	_, err = s.DB.ExecContext(ctx, `UPDATE pay_connections SET disabled_at = ?, api_key_enc = '', secret_enc = '' WHERE id = ?`, s.Now().Unix(), id)
	return err
}

// ---- webhooks ----

// Webhook serves POST /webhooks/{provider}/{connection}.
func (s *Service) Webhook(w http.ResponseWriter, r *http.Request) {
	provider, id := r.PathValue("provider"), r.PathValue("conn")
	p, ok := payments.Registry[provider]
	if !ok {
		http.Error(w, "unknown provider", http.StatusNotFound)
		return
	}
	if s.KeyErr != nil {
		w.Header().Set("Retry-After", "600")
		http.Error(w, "trckable cannot decrypt its secrets; the owner must restore TRCKABLE_SECRET", http.StatusServiceUnavailable)
		return
	}
	c, err := s.connection(r.Context(), id, true)
	if errors.Is(err, auth.ErrNotFound) || (err == nil && c.Provider != provider) {
		http.Error(w, "unknown connection", http.StatusNotFound)
		return
	}
	if err != nil {
		w.Header().Set("Retry-After", "60")
		http.Error(w, "temporarily unavailable", http.StatusServiceUnavailable)
		return
	}
	if c.secret == "" { // manual setup not finished: an empty HMAC key would verify anyone's forgery
		http.Error(w, "this connection has no signing secret yet: paste it in trckable Settings → Payments", http.StatusBadRequest)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 2<<20))
	if err != nil {
		http.Error(w, "read error", http.StatusBadRequest)
		return
	}
	if err := p.Verify(r.Header, body, c.secret, s.Now()); err != nil {
		// Forged webhooks cost a signature check each: after a burst from one
		// connection, stop answering for a while.
		if n := s.bad.hit(id, s.Now()); n > badSigBurst {
			w.Header().Set("Retry-After", "60")
			http.Error(w, "too many invalid signatures", http.StatusTooManyRequests)
			return
		}
		slog.Warn("payments: rejected webhook", "provider", provider, "connection", id, "err", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	s.bad.ok(id)
	ev, perr := p.Parse(body)
	key := ev.Key
	if key == "" {
		key = r.Header.Get("webhook-id") // Standard Webhooks message id
	}
	if key == "" {
		key = "sha:" + hex.EncodeToString(auth.Hash(string(body))[:12])
	}
	now := s.Now()
	col := "last_event_at"
	if ev.Test || c.Mode == "test" {
		col = "last_test_at"
	}
	// fsync'd (synchronous=FULL) before we answer 200.
	if _, err := s.DB.ExecContext(r.Context(), `INSERT OR IGNORE INTO pay_inbox (connection_id, event_key, received_at, source, body) VALUES (?, ?, ?, 'webhook', ?)`,
		id, key, now.UnixMilli(), body); err != nil {
		w.Header().Set("Retry-After", "30")
		http.Error(w, "storage error", http.StatusServiceUnavailable)
		return
	}
	s.DB.ExecContext(r.Context(), `UPDATE pay_connections SET `+col+` = ? WHERE id = ?`, now.Unix(), id)
	if perr != nil {
		slog.Warn("payments: stored a webhook we couldn't parse (kept for reprocessing)", "provider", provider, "err", perr)
	}
	s.Kick()
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"received":true}`))
}

// badSigBurst is how many invalid signatures one connection may send per
// minute before it is turned away (providers retry, so a real secret
// rotation still gets through afterwards).
const badSigBurst = 20

type badSigs struct {
	mu sync.Mutex
	m  map[string][]time.Time
}

func (b *badSigs) hit(id string, now time.Time) int {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.m == nil {
		b.m = map[string][]time.Time{}
	}
	keep := b.m[id][:0]
	for _, t := range b.m[id] {
		if now.Sub(t) < time.Minute {
			keep = append(keep, t)
		}
	}
	b.m[id] = append(keep, now)
	if len(b.m) > 1000 { // bounded: drop the map rather than grow forever
		b.m = map[string][]time.Time{id: b.m[id]}
	}
	return len(b.m[id])
}

func (b *badSigs) ok(id string) {
	b.mu.Lock()
	delete(b.m, id)
	b.mu.Unlock()
}

// Kick wakes the processor.
func (s *Service) Kick() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

// ---- processing ----

// Run processes the inbox, reconciles every 6 hours and refreshes FX rates.
func (s *Service) Run(ctx context.Context) {
	s.Kick()
	syncT := time.NewTicker(6 * time.Hour)
	fxT := time.NewTicker(12 * time.Hour)
	defer syncT.Stop()
	defer fxT.Stop()
	go s.refreshFX(ctx)
	go func() { // first reconciliation shortly after boot
		select {
		case <-ctx.Done():
		case <-time.After(2 * time.Minute):
			s.SyncAll(ctx)
		}
	}()
	for {
		if n, err := s.Process(ctx); err != nil {
			slog.Error("payments: processing the inbox", "err", err)
		} else if n > 0 {
			slog.Debug("payments: processed", "events", n)
		}
		select {
		case <-ctx.Done():
			return
		case <-s.wake:
		case <-syncT.C:
			go s.SyncAll(ctx)
		case <-fxT.C:
			go s.refreshFX(ctx)
		case <-time.After(time.Minute):
		}
	}
}

// Process applies pending inbox rows to the ledger; returns how many.
func (s *Service) Process(ctx context.Context) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	total := 0
	for {
		rows, err := s.DB.QueryContext(ctx, `SELECT i.id, i.body, c.site_id, c.provider, c.id, c.mode FROM pay_inbox i
			JOIN pay_connections c ON c.id = i.connection_id WHERE i.processed_at IS NULL ORDER BY i.id LIMIT 200`)
		if err != nil {
			return total, err
		}
		type item struct {
			id   int64
			body []byte
			sc   ledger.Scope
		}
		var items []item
		for rows.Next() {
			var it item
			var mode string
			if err := rows.Scan(&it.id, &it.body, &it.sc.Site, &it.sc.Provider, &it.sc.Connection, &mode); err != nil {
				rows.Close()
				return total, err
			}
			it.sc.Test, it.sc.EmailKey = mode == "test", s.emailKey
			items = append(items, it)
		}
		rows.Close()
		if len(items) == 0 {
			return total, nil
		}
		// One transaction per batch: one fsync for 200 events, all or nothing.
		tx, err := s.DB.BeginTx(ctx, nil)
		if err != nil {
			return total, err
		}
		sites := map[string]bool{}
		type announced struct {
			site string
			sale Sale
		}
		var sales []announced
		for _, it := range items {
			ev, perr := payments.Registry[it.sc.Provider].Parse(it.body)
			msg := ""
			if perr != nil {
				msg = "parse: " + perr.Error()
			} else {
				// Which payments are new has to be asked before Apply writes
				// them; afterwards every one of them exists.
				if s.OnSale != nil && !it.sc.Test && !ev.Test {
					for _, p := range ev.Payments {
						if s.Now().UnixMilli()-p.PaidAt > liveWindow.Milliseconds() {
							continue
						}
						var seen int
						_ = tx.QueryRowContext(ctx, `SELECT count(*) FROM pay_payments WHERE site_id = ? AND provider = ? AND id = ?`,
							it.sc.Site, it.sc.Provider, p.ID).Scan(&seen)
						if seen > 0 {
							continue
						}
						net := p.Gross
						if p.Tax != nil {
							net -= *p.Tax
						}
						cur := strings.ToUpper(p.Currency)
						sales = append(sales, announced{it.sc.Site, Sale{At: p.PaidAt, Amount: net, Currency: cur, Exponent: fx.Exponent(cur), Kind: p.Kind}})
					}
				}
				if err := ledger.Apply(ctx, tx, it.sc, ev); err != nil {
					tx.Rollback()
					return total, err
				}
				// A notice about someone who was erased: the money is kept, the
				// payload with their address is not.
				gone, err := erasedEvent(ctx, tx, it.sc, ev)
				if err != nil {
					tx.Rollback()
					return total, err
				}
				if gone {
					if _, err := tx.ExecContext(ctx, `DELETE FROM pay_inbox WHERE id = ?`, it.id); err != nil {
						tx.Rollback()
						return total, err
					}
					sites[it.sc.Site] = true
					continue
				}
			}
			if _, err := tx.ExecContext(ctx, `UPDATE pay_inbox SET processed_at = ?, error = ? WHERE id = ?`, s.Now().UnixMilli(), msg, it.id); err != nil {
				tx.Rollback()
				return total, err
			}
			sites[it.sc.Site] = true
		}
		for site := range sites {
			if _, err := forgetErased(ctx, tx, site); err != nil {
				tx.Rollback()
				return total, err
			}
		}
		if err := tx.Commit(); err != nil {
			return total, err
		}
		total += len(items)
		if s.OnChange != nil {
			for site := range sites {
				s.OnChange(site)
			}
		}
		// Only after the commit: a sale shown live is a sale the ledger has.
		for _, a := range sales {
			s.OnSale(a.site, a.sale)
		}
	}
}

// Sale is one payment announced live: what arrived, not who paid it.
type Sale struct {
	At       int64  `json:"ts"`       // unix ms
	Amount   int64  `json:"amount"`   // net of tax when tax is known, minor units
	Currency string `json:"currency"` // ISO 4217
	Exponent int    `json:"exponent"` // minor-unit digits
	Kind     string `json:"kind"`     // one_time | subscription | renewal
}

// liveWindow is how recent a payment must be to be announced. A reconciliation
// that finds one from last week is filling a gap, not reporting a sale.
const liveWindow = 10 * time.Minute

// Reprocess rebuilds a site's ledger from its inbox in one transaction.
func (s *Service) Reprocess(ctx context.Context, site string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	if err := ledger.Reset(ctx, tx, site); err != nil {
		return 0, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT i.body, c.provider, c.id, c.mode FROM pay_inbox i JOIN pay_connections c ON c.id = i.connection_id
		WHERE c.site_id = ? ORDER BY i.id`, site)
	if err != nil {
		return 0, err
	}
	type item struct {
		body []byte
		sc   ledger.Scope
	}
	var items []item
	for rows.Next() {
		var it item
		var mode string
		if err := rows.Scan(&it.body, &it.sc.Provider, &it.sc.Connection, &mode); err != nil {
			rows.Close()
			return 0, err
		}
		it.sc.Site, it.sc.Test, it.sc.EmailKey = site, mode == "test", s.emailKey
		items = append(items, it)
	}
	rows.Close()
	for _, it := range items {
		if ev, err := payments.Registry[it.sc.Provider].Parse(it.body); err == nil {
			if err := ledger.Apply(ctx, tx, it.sc, ev); err != nil {
				return 0, err
			}
		}
	}
	// A rebuild starts from nothing, so the erased are unlinked again here:
	// a reprocess must never bring back someone a data request removed.
	if _, err := forgetErased(ctx, tx, site); err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	if s.OnChange != nil {
		s.OnChange(site)
	}
	return len(items), nil
}

// ---- reconciliation ----

// SyncAll reconciles every managed connection (last 7 days).
func (s *Service) SyncAll(ctx context.Context) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id FROM pay_connections WHERE disabled_at IS NULL AND api_key_enc <> ''`)
	if err != nil {
		return
	}
	var ids []string
	for rows.Next() {
		var id string
		rows.Scan(&id)
		ids = append(ids, id)
	}
	rows.Close()
	for _, id := range ids {
		s.Sync(ctx, id, 7*24*time.Hour)
	}
}

// Sync pulls the provider's recent payments into the inbox (deduped against
// webhooks by key) and processes them.
func (s *Service) Sync(ctx context.Context, id string, window time.Duration) (int, error) {
	c, err := s.connection(ctx, id, true)
	if err != nil {
		return 0, err
	}
	if c.apiKey == "" {
		return 0, errors.New("this connection has no API key: reconciliation needs one")
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	raws, err := payments.Remotes[c.Provider].Sync(ctx, c.apiKey, c.Mode == "test", c.setup(), s.Now().Add(-window))
	added := 0
	for _, r := range raws {
		res, e := s.DB.ExecContext(ctx, `INSERT OR IGNORE INTO pay_inbox (connection_id, event_key, received_at, source, body) VALUES (?, ?, ?, 'sync', ?)`,
			id, r.Key, s.Now().UnixMilli(), r.Body)
		if e == nil {
			if n, _ := res.RowsAffected(); n > 0 {
				added++
			}
		}
	}
	msg := ""
	if err != nil {
		msg = err.Error()
		slog.Warn("payments: reconciliation", "provider", c.Provider, "connection", id, "err", err)
	}
	s.DB.ExecContext(ctx, `UPDATE pay_connections SET last_sync_at = ?, last_error = ? WHERE id = ?`, s.Now().Unix(), msg, id)
	if added > 0 {
		s.Kick()
		s.ensureRatesFor(ctx)
	}
	return added, err
}

// ---- FX ----

func (s *Service) refreshFX(ctx context.Context) {
	if !s.needsFX(ctx) {
		return
	}
	s.ensureRatesFor(ctx)
}

// needsFX reports whether any payment is in a currency other than its
// site's (then, and only then, trckable contacts the ECB).
func (s *Service) needsFX(ctx context.Context) bool {
	var n int
	s.DB.QueryRowContext(ctx, `SELECT count(*) FROM pay_payments p JOIN sites st ON st.id = p.site_id WHERE p.currency <> st.currency`).Scan(&n)
	return n > 0
}

func (s *Service) ensureRatesFor(ctx context.Context) {
	if !s.needsFX(ctx) {
		return
	}
	var oldest sql.NullInt64
	s.DB.QueryRowContext(ctx, `SELECT min(p.paid_at) FROM pay_payments p JOIN sites st ON st.id = p.site_id WHERE p.currency <> st.currency`).Scan(&oldest)
	feed := fx.ECB90d
	if oldest.Valid {
		first := s.Rates.Earliest(ctx)
		day := time.UnixMilli(oldest.Int64).UTC().Format("2006-01-02")
		if first == "" || day < first {
			if time.Since(time.UnixMilli(oldest.Int64)) > 85*24*time.Hour {
				feed = fx.ECBFull
			}
		}
	}
	if _, err := s.Rates.Fetch(ctx, payments.HTTPClient, feed); err != nil {
		slog.Warn("payments: couldn't fetch ECB exchange rates (foreign-currency payments wait)", "err", err)
	}
}

// ---- reports ----

// Facts returns a site's payments for a report.
func (s *Service) Facts(ctx context.Context, site, currency string, from, to time.Time, test bool) ([]ledger.Fact, error) {
	return ledger.Facts(ctx, s.DB, s.Rates, site, currency, from, to, test)
}

// Enabled reports whether a site has (or had) any payment connection.
func (s *Service) Enabled(ctx context.Context, site string) bool {
	var n int
	s.DB.QueryRowContext(ctx, `SELECT count(*) FROM pay_connections WHERE site_id = ?`, site).Scan(&n)
	return n > 0
}

func isLocal(host string) bool {
	h := strings.ToLower(host)
	return h == "localhost" || h == "127.0.0.1" || h == "::1" || strings.HasSuffix(h, ".local") || strings.HasSuffix(h, ".internal") || strings.HasSuffix(h, ".localhost")
}

func providerTitle(p string) string {
	return map[string]string{"stripe": "Stripe", "lemonsqueezy": "Lemon Squeezy", "polar": "Polar", "paddle": "Paddle", "dodo": "Dodo Payments"}[p]
}

// StartOver is the way out when the instance key is lost: the provider keys
// and signing secrets sealed with the old key are unreadable, so they are
// forgotten, and the current key becomes the one the data is checked
// against. Every connection then waits for its keys again (reconnect it),
// the Search Console key is removed, and payments already recorded stay.
// Email hashes made with the old key no longer match new ones.
func (s *Service) StartOver(ctx context.Context) (connections int, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, `UPDATE pay_connections SET api_key_enc = '', secret_enc = ''`)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	if _, err := tx.ExecContext(ctx, `DELETE FROM search_console`); err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO meta (key, value) VALUES ('secret_kcv', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, s.Box.KCV()); err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	s.KeyErr = nil
	slog.Warn("payments started over with the current key: old provider keys forgotten", "connections", n)
	return int(n), nil
}
