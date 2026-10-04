// Package server wires trckable together with a boot order that never loses
// data:
//
//  1. SQLite control plane (milliseconds)
//  2. WAL
//  3. HTTP listener — ingest is live from here on
//  4. DuckDB opens/migrates in the background; the writer then drains the WAL
//
// Shutdown reverses it: stop HTTP, close the WAL (commits queued appends),
// let the writer drain everything durable into DuckDB, checkpoint, close.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/api"
	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/backup"
	"github.com/trckable/trckable/server/internal/config"
	"github.com/trckable/trckable/server/internal/geo"
	"github.com/trckable/trckable/server/internal/ingest"
	"github.com/trckable/trckable/server/internal/ledger"
	"github.com/trckable/trckable/server/internal/modules"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/realtime"
	"github.com/trckable/trckable/server/internal/revenue"
	"github.com/trckable/trckable/server/internal/secrets"
	"github.com/trckable/trckable/server/internal/store/duck"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/upgrade"
	"github.com/trckable/trckable/server/internal/wal"
	"github.com/trckable/trckable/server/internal/web"
	"github.com/trckable/trckable/server/internal/writer"
)

// Version is set at build time (-ldflags "-X .../server.Version=v1.2.3").
var Version = "0.5.8" // the VERSION file; release builds stamp it too

// Server is a running trckable instance.
type Server struct {
	cfg    config.Config
	ctl    *sqlite.Store
	log    *wal.Log
	ingest *ingest.Handler
	http   *http.Server
	geo    *geo.DB
	// asn is the network database behind stricter bot filtering. It is only
	// downloaded once a site that uses it gets a visit.
	asn        *geo.DB
	asnStarted atomic.Bool
	bg         atomic.Pointer[context.Context]
	hub        *realtime.Hub
	revenue    *revenue.Service
	api        *api.API
	box        *secrets.Box

	duck      atomic.Pointer[duck.Store]
	writer    atomic.Pointer[writer.Writer]
	writerErr atomic.Value // error
	stopWrite context.CancelFunc
	writerWG  sync.WaitGroup
	started   time.Time
	// readyzLogged is when /readyz last logged a failure (unix nanoseconds).
	readyzLogged atomic.Int64
	// remote is the bucket backups are copied to (TRCKABLE_BACKUP_S3), and
	// offsite how the last copy went.
	remote  *backup.Remote
	offsite atomic.Pointer[offsiteStatus]
	// backupErr is why the last local backup failed, and when; nil after a
	// backup that worked. Shown in Settings → Health, not only in the log.
	backupErr atomic.Pointer[backupFailure]
}

// New performs boot steps 1–2 and prepares the listener.
func New(ctx context.Context, cfg config.Config) (*Server, error) {
	if err := PrepareDataDir(cfg.DataDir); err != nil {
		return nil, err
	}
	// The write-ahead log first: its lock proves no other trckabled runs on
	// this data directory, before an upgrade copies and migrates it.
	lg, err := wal.Open(cfg.WALDir(), wal.Options{NoSync: cfg.WALNoSync})
	if err != nil {
		return nil, fmt.Errorf("open wal: %w", err)
	}
	ctl, err := openControl(ctx, cfg)
	if err != nil {
		lg.Close()
		return nil, err
	}
	keepPrivate(cfg.DataDir)
	var newSites []string
	for _, d := range cfg.Sites { // headless provisioning via TRCKABLE_SITES
		id, created, err := ctl.EnsureSite(ctx, sqlite.DefaultAccount, d)
		if err != nil {
			ctl.Close()
			lg.Close()
			return nil, fmt.Errorf("TRCKABLE_SITES %q: %w", d, err)
		}
		slog.Info("site", "domain", d, "id", id, "created", created)
		if created {
			newSites = append(newSites, id)
		}
	}
	s := &Server{cfg: cfg, ctl: ctl, log: lg, started: time.Now()}
	s.geo = geo.New(geo.Mode(cfg.Geo), cfg.GeoDir())
	s.geo.Shared = cfg.GeoShared != ""
	_ = s.geo.Load() // missing on first boot: downloaded in the background by Run
	if geo.Mode(cfg.Geo) != geo.Off {
		s.asn = geo.New(geo.ASN, cfg.GeoDir())
		s.asn.Shared = cfg.GeoShared != ""
		_ = s.asn.Load()
	}
	s.ingest = &ingest.Handler{
		Log:      lg,
		Sites:    ctl,
		Salts:    ingest.NewSalts(ctl),
		Seen:     ctl,
		ClientIP: ipResolver(cfg),
		Now:      time.Now,
		Geo: func(ip string) (string, string, string) {
			l := s.geo.Lookup(ip)
			return l.Country, l.Region, l.City
		},
		Hosting: s.hosting,
		Module: func(site, id string) bool {
			set, err := (modules.Store{DB: ctl.DB}).Of(context.Background(), site)
			return err != nil || set.Has(id) // unreadable: record rather than lose
		},
	}
	mux := http.NewServeMux()
	mux.Handle("/api/e", s.ingest)
	mux.HandleFunc("/api/crawl", s.ingest.Crawl) // robots, reported by the site's own server
	feat := func(site string) []string {
		set, err := (modules.Store{DB: ctl.DB}).Of(ctx, site)
		if err != nil {
			return []string{"goals", "outbound", "checkout"} // fail open: a site keeps tracking
		}
		out := set.Tracker()
		// One consent module, two ways of asking. Reading the banner a site
		// already runs is 197 B; trckable's own bar is 940, so the choice
		// decides which one the browser downloads.
		if set.Has("consent") {
			if c, err := ctl.SiteConfig(ctx, site); err == nil && c.Banner.Mode == "bar" {
				for i, f := range out {
					if f == modules.TrackConsent {
						out[i] = modules.TrackBanner
					}
				}
				sort.Strings(out)
			}
		}
		return out
	}
	opts := func(site string) web.ScriptOpts {
		c, err := ctl.SiteConfig(ctx, site)
		if err != nil {
			return web.ScriptOpts{}
		}
		return web.ScriptOpts{
			ConsentFree:    c.ConsentFree,
			BannerText:     c.Banner.Text,
			BannerAccept:   c.Banner.Accept,
			BannerDecline:  c.Banner.Decline,
			BannerPolicy:   c.Banner.Policy,
			BannerBg:       c.Banner.Bg,
			BannerFg:       c.Banner.Fg,
			BannerButton:   c.Banner.Button,
			BannerButtonFg: c.Banner.ButtonFg,
			BannerPosition: c.Banner.Position,
			BannerRadius:   c.Banner.Radius,
			BannerCSS:      c.Banner.CSS,
		}
	}
	mux.Handle("GET /js/{file}", web.Tracker(feat, opts))
	s.hub = realtime.New()
	box, err := secrets.Load(cfg.DataDir, cfg.Secret)
	s.box = box
	if err != nil {
		ctl.Close()
		lg.Close()
		return nil, fmt.Errorf("secrets: %w", err)
	}
	ctl.Sealer = box // two-step secrets are kept sealed with the instance key
	if s.revenue, err = revenue.New(ctx, ctl.DB, box); err != nil {
		ctl.Close()
		lg.Close()
		return nil, fmt.Errorf("payments: %w", err)
	}
	a := &api.API{
		Ctl: ctl, Hub: s.hub, Token: cfg.APIToken, SetupEnv: cfg.SetupToken, ClientIP: s.ingest.ClientIP,
		Revenue: s.revenue, BaseURL: cfg.BaseURL, Box: box, Version: Version, UpdateCheck: cfg.UpdateCheck,
		Query: func() *query.Q {
			st, w := s.duck.Load(), s.writer.Load()
			if st == nil || w == nil || !w.Ready() {
				return nil
			}
			return &query.Q{DB: st.DB, Open: w.OpenSessions, Payments: s.payments}
		},
		// Only the writer may write to DuckDB, so deleting a site's analytics
		// data is handed to it as a job. Before it is running there is nothing
		// to delete yet, and the delete is refused rather than half-done.
		HealthOf: s.health,
		PurgeAnalytics: func(ctx context.Context, site string) (int64, int64, error) {
			w := s.writer.Load()
			if w == nil || !w.Ready() {
				return 0, 0, errors.New("the analytics store is still warming up")
			}
			return w.PurgeSite(ctx, site)
		},
		ErasePerson: func(ctx context.Context, site string, visitor uint64) (int64, int64, error) {
			w := s.writer.Load()
			if w == nil || !w.Ready() {
				return 0, 0, errors.New("the analytics store is still warming up")
			}
			return w.ErasePerson(ctx, site, visitor)
		},
	}
	a.SendWeekly = s.sendWeeklyNow
	s.api = a
	// Off-site backups, when the owner names a bucket. A bad value is said
	// loudly and leaves backups local, rather than stopping the server.
	if r, err := backup.ParseRemote(cfg.BackupS3); err != nil {
		slog.Warn("off-site backups are off", "err", err)
	} else {
		s.remote = r
		s.loadOffsite(ctx)
	}
	// Alerts by email, when the owner gives trckable an SMTP server (or a
	// Resend key, for hosts that block SMTP) to use.
	if cfg.SMTPURL != "" || cfg.ResendKey != "" {
		m, err := alerts.ParseMailer(cfg.SMTPURL, cfg.MailFrom)
		if cfg.ResendKey != "" {
			m, err = alerts.ParseResend(cfg.ResendKey, cfg.MailFrom)
		}
		if err != nil {
			slog.Warn("email alerts are off", "err", err)
		} else {
			alerts.Mail = m
		}
	}
	// A site added to TRCKABLE_SITES after the owner exists starts like any
	// new site (before the owner exists there is no one to tell; setup does it).
	for _, id := range newSites {
		if _, err := ctl.DefaultAlerts(ctx, sqlite.DefaultAccount, id, alerts.Mail != nil); err != nil {
			slog.Warn("default alerts not set", "err", err)
		}
	}
	a.Routes(mux)
	if s.revenue.KeyErr != nil {
		// Next to the payments warning: two-step secrets are sealed with the
		// same key, so apps' codes stop working too.
		slog.Error("two-step sign-in: authenticator codes cannot be checked with this key; people sign in with a recovery code, or `trckabled admin disable-2fa <email>` turns it off for them")
	}
	s.revenue.OnChange = a.PurgeSite
	s.revenue.OnRates = a.PurgeAll // a new exchange rate changes what past payments are worth
	s.revenue.OnSale = func(site string, sale revenue.Sale) {
		s.hub.PublishSale(site, sale.At, sale.Amount, sale.Currency, sale.Exponent)
	}
	// Webhooks go straight to the SQLite inbox: they work while DuckDB warms up.
	mux.HandleFunc("POST /webhooks/{provider}/{conn}", s.revenue.Webhook)
	mux.Handle("/", web.DashboardFramed(a.FrameAncestors))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	mux.HandleFunc("GET /readyz", s.readyz)
	mux.HandleFunc("GET /metrics", s.metrics)
	mux.HandleFunc("GET /_trckable/whoami", s.whoami)
	s.http = &http.Server{
		Addr:              cfg.Addr,
		Handler:           withHeaders(s.proxyHint(a.ShareDomains(mux))),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    16 << 10,
		ErrorLog:          serverLog(os.Stderr), // its own lines, without visitors' addresses
	}
	// Shutdown waits for requests in flight, and a live stream is one that
	// never finishes: end them first so a redeploy is not held for the drain.
	s.http.RegisterOnShutdown(a.Stop)
	s.announceSetup(ctx)
	return s, nil
}

// announceSetup logs the one-time setup link until the first account exists.
// The token is in the URL fragment, so it never reaches proxies or access logs.
func (s *Server) announceSetup(ctx context.Context) {
	if has, err := s.ctl.HasUsers(ctx); err != nil || has {
		return
	}
	tok, err := s.ctl.SetupToken(ctx, s.cfg.SetupToken)
	if err != nil {
		return
	}
	base := s.cfg.BaseURL
	if base == "" {
		base = "http://" + localURLHost(s.cfg.Addr)
	}
	slog.Warn("trckable is not set up yet — open this link to create your account", "url", strings.TrimSuffix(base, "/")+"/setup#token="+tok)
}

// payments feeds the ledger into reports (nil facts, enabled=false, when the
// site never connected a provider).
func (s *Server) payments(ctx context.Context, site, currency string, from, to time.Time, test bool) ([]ledger.Fact, bool, error) {
	if !s.revenue.Enabled(ctx, site) {
		return nil, false, nil
	}
	f, err := s.revenue.Facts(ctx, site, currency, from, to, test)
	return f, true, err
}

// localURLHost turns a listen address into something a browser can open:
// ":8080" and "0.0.0.0:8080" become "localhost:8080".
func localURLHost(addr string) string {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "localhost"
	}
	return net.JoinHostPort(host, port)
}

func ipResolver(cfg config.Config) ingest.IPResolver {
	switch mode := cfg.TrustProxy; {
	case mode == "none":
		return ingest.RemoteIP
	case mode == "xff":
		return ingest.RightmostForwardedIP
	case strings.HasPrefix(mode, "header:"):
		return ingest.HeaderIP(strings.TrimPrefix(mode, "header:"))
	default: // auto
		// Verified on a live deploy (2026-09-22): Railway's edge overwrites
		// X-Real-IP with the true client IP (forged values are discarded),
		// while the rightmost X-Forwarded-For entry is a CDN edge node.
		if cfg.OnRailway {
			return ingest.HeaderIP("X-Real-IP")
		}
		return ingest.RemoteIP
	}
}

// proxyWarning is logged once, the first time a request comes through what
// looks like a reverse proxy while no forwarded address is trusted.
const proxyWarning = "requests arrive through a reverse proxy, but TRCKABLE_TRUST_PROXY is not set, so every visitor looks like one address: " +
	"the sign-in limits are shared by everyone and visitor countries show the proxy's place. " +
	"Set TRCKABLE_TRUST_PROXY=xff when one proxy in front of trckable adds X-Forwarded-For (Caddy, nginx, Traefik do), " +
	"or header:<Name> for a header your proxy sets (header:X-Real-IP, header:CF-Connecting-IP), then restart. " +
	"Check it with: npx trckable doctor"

// proxyHint warns, once, about the setup that locks everyone out together:
// the mode is "auto" (which trusts nothing off Railway), the connection comes
// from a private or loopback address, and the request carries the headers a
// proxy adds. A direct visit from localhost carries none, and says nothing.
func (s *Server) proxyHint(h http.Handler) http.Handler {
	if s.cfg.TrustProxy != "auto" || s.cfg.OnRailway {
		return h
	}
	var said atomic.Bool
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !said.Load() && ingest.SawProxyHeaders(r) && ingest.SharedPeer(r, ingest.RemoteIP(r)) && said.CompareAndSwap(false, true) {
			slog.Warn(proxyWarning)
		}
		h.ServeHTTP(w, r)
	})
}

func withHeaders(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Trckable-Version", Version)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		// A dashboard, a share link and its API are never search results.
		w.Header().Set("X-Robots-Tag", "noindex, nofollow")
		h.ServeHTTP(w, r)
	})
}

// Run performs boot steps 3–4 and blocks until ctx is cancelled, then shuts
// down gracefully.
func (s *Server) Run(ctx context.Context) error {
	errc := make(chan error, 1)
	go func() {
		slog.Info("trckable listening", "addr", s.cfg.Addr, "version", Version, "data", s.cfg.DataDir)
		if err := s.http.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errc <- err
		}
	}()

	wctx, stop := context.WithCancel(context.Background())
	s.stopWrite = stop
	s.writerWG.Add(1)
	go s.startAnalytics(wctx)
	s.bg.Store(&wctx)
	go s.geo.Run(wctx) // keeps the geo database present and fresh
	go s.revenue.Run(wctx)
	go s.runRetention(wctx)    // each site's own "keep for N days"
	go s.runBackups(wctx)      // one encrypted copy a day, kept on the volume
	go s.runLoginResets(wctx)  // sign-in limits cleared when an owner resets a password
	go s.runAlerts(wctx)       // the four things worth being told about
	go s.runHealthAlerts(wctx) // the installation's own problems, sent as they start and clear
	go s.runChecks(wctx)       // each site's snippet, looked for once a day
	go s.runLogRetry(wctx)     // events again once a full disk has room

	select {
	case <-ctx.Done():
	case err := <-errc:
		return errors.Join(err, s.shutdown())
	}
	return s.shutdown()
}

// startAnalytics opens DuckDB (retrying while a previous instance still holds
// the file lock during a redeploy) and runs the writer.
func (s *Server) startAnalytics(ctx context.Context) {
	defer s.writerWG.Done()
	var store *duck.Store
	var err error
	for attempt := 0; ; attempt++ {
		// Upgraded at boot, with a copy kept first; never here without one.
		store, err = duck.Open(ctx, s.cfg.DuckPath(), duck.Options{Threads: s.cfg.DuckThreads, MemoryLimit: s.cfg.DuckMemory, NoUpgrade: true})
		if err == nil {
			keepPrivate(s.cfg.DataDir)
			break
		}
		if errors.Is(err, duck.ErrNeedsUpgrade) {
			// The control database said the store was current and it is not
			// (a file put back by hand): the next start looks again.
			if ferr := upgrade.Forget(ctx, s.ctl); ferr != nil {
				slog.Warn("could not mark the analytics store for a check", "err", ferr)
			}
			slog.Error("analytics store unavailable", "err", err)
			s.writerErr.Store(err)
			return
		}
		if ctx.Err() != nil || attempt >= 60 {
			slog.Error("analytics store unavailable", "err", err)
			s.writerErr.Store(err)
			return
		}
		slog.Warn("analytics store not ready, retrying", "err", err)
		select {
		case <-time.After(500 * time.Millisecond):
		case <-ctx.Done():
			return
		}
	}
	s.duck.Store(store)
	if err := upgrade.Remember(ctx, s.ctl); err != nil {
		slog.Warn("could not record the analytics store's schema", "err", err)
	}
	s.backfillSeen(ctx, store)
	w := writer.New(s.log, store, writer.Options{CloseAfter: s.cfg.SessionCloseAfter, IdleClose: idleClose(s.cfg), Sites: s.ctl.ExistingSites, SiteZone: s.ctl.SiteZone})
	w.OnCommit = s.hub.Publish
	w.OnTouch = func(site string, lo, hi int64) {
		s.hub.Bump(site)            // a commit that only wrote out idle visits still moves the live reports' version
		s.api.Touched(site, lo, hi) // closed ranges the commit can reach stop being served from the report cache
	}
	s.writer.Store(w)
	go s.flushBotsEvery(ctx)
	slog.Info("analytics store ready")
	if err := w.Run(ctx); err != nil {
		slog.Error("writer stopped", "err", err)
		s.writerErr.Store(err)
	}
}

func (s *Server) shutdown() error {
	slog.Info("shutting down: draining")
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(s.cfg.DrainSeconds)*time.Second)
	defer cancel()
	herr := s.http.Shutdown(ctx) // stop accepting; finish in-flight requests
	bctx, bcancel := context.WithTimeout(ctx, 10*time.Second)
	s.flushBots(bctx) // the last minute of bot counts, while the writer still runs
	bcancel()
	werr := s.log.Close() // commit every queued append
	s.stopWrite()         // writer drains what is durable, then returns
	s.writerWG.Wait()
	var derr error
	if st := s.duck.Load(); st != nil {
		derr = st.Close() // FORCE CHECKPOINT + close
	}
	cerr := s.ctl.Close()
	slog.Info("shutdown complete")
	return errors.Join(herr, werr, derr, cerr)
}

type readiness struct {
	Status         string `json:"status"`
	Version        string `json:"version"`
	AnalyticsReady bool   `json:"analytics_ready"`
	WALCommitted   uint64 `json:"wal_committed"`
	WALApplied     uint64 `json:"wal_applied"`
	WALLag         uint64 `json:"wal_lag"`
	WALBytes       int64  `json:"wal_bytes"`
	Error          string `json:"error,omitempty"`
}

// readyz is healthy as soon as events can be accepted durably (SQLite + WAL);
// the analytics store warming up is reported but does not fail readiness.
func (s *Server) readyz(w http.ResponseWriter, r *http.Request) {
	committed, _ := s.log.Committed()
	rd := readiness{Status: "ok", Version: Version, WALCommitted: committed, WALBytes: s.log.SizeBytes()}
	if wr := s.writer.Load(); wr != nil {
		rd.AnalyticsReady = true
		rd.WALApplied = wr.Applied()
		if committed > rd.WALApplied {
			rd.WALLag = committed - rd.WALApplied
		}
	}
	// The answer names the part that is failing and nothing else: the
	// detail (a path, a driver's words) goes to the log, a minute apart at
	// most, because a probe asks every few seconds.
	code := http.StatusOK
	if err := s.log.Err(); err != nil {
		rd.Status, rd.Error, code = "unavailable", "the write-ahead log is failing", http.StatusServiceUnavailable
		s.readyzLog(rd.Error, err)
	} else if err := s.ctl.Ping(r.Context()); err != nil {
		rd.Status, rd.Error, code = "unavailable", "the control database is not answering", http.StatusServiceUnavailable
		s.readyzLog(rd.Error, err)
	} else if v := s.writerErr.Load(); v != nil {
		rd.Status, rd.Error = "degraded", "the analytics writer reported an error" // events still durable in the WAL
		s.readyzLog(rd.Error, v.(error))
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(rd)
}

// readyzLog logs why /readyz is not healthy, at most once a minute.
func (s *Server) readyzLog(what string, err error) {
	now := time.Now().UnixNano()
	last := s.readyzLogged.Load()
	if now-last < int64(time.Minute) || !s.readyzLogged.CompareAndSwap(last, now) {
		return
	}
	slog.Warn("readyz: "+what, "err", err)
}

// metrics exposes Prometheus text format with trckable_* names. It is off
// (404) unless TRCKABLE_METRICS_TOKEN is set, and then needs that token as a
// bearer token: installation-wide counts are not for the internet. The API
// token does not open it: it reads every site, this reads one page of counts,
// and the two are not given to the same scraper.
func (s *Server) metricsOpen() bool { return s.cfg.MetricsToken != "" }

func (s *Server) metricsAllowed(r *http.Request) bool {
	got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	return s.metricsOpen() && auth.Equal(got, s.cfg.MetricsToken)
}

func (s *Server) metrics(w http.ResponseWriter, r *http.Request) {
	if !s.metricsOpen() {
		http.NotFound(w, r)
		return
	}
	if !s.metricsAllowed(r) {
		w.Header().Set("WWW-Authenticate", "Bearer")
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	committed, _ := s.log.Committed()
	var applied uint64
	if wr := s.writer.Load(); wr != nil {
		applied = wr.Applied()
	}
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "trckable_events_accepted_total %d\n", s.ingest.Stats.Accepted.Load())
	fmt.Fprintf(w, "trckable_events_bots_total %d\n", s.ingest.Stats.Bots.Load())
	fmt.Fprintf(w, "trckable_events_rejected_total %d\n", s.ingest.Stats.Rejected.Load())
	fmt.Fprintf(w, "trckable_wal_committed_seq %d\n", committed)
	fmt.Fprintf(w, "trckable_wal_applied_seq %d\n", applied)
	fmt.Fprintf(w, "trckable_wal_bytes %d\n", s.log.SizeBytes())
	fmt.Fprintf(w, "trckable_uptime_seconds %d\n", int(time.Since(s.started).Seconds()))
}

// whoami echoes the caller's own address as trckable resolves it, so setups
// behind proxies can be verified (used by `npx trckable doctor`). It only ever
// reveals the caller's own IP to the caller, and nothing is stored.
func (s *Server) whoami(w http.ResponseWriter, r *http.Request) {
	out := map[string]any{
		"ip":        s.ingest.ClientIP(r),
		"forwarded": r.Header.Get("X-Forwarded-For") != "",
		"trust":     s.cfg.TrustProxy,
		"railway":   s.cfg.OnRailway,
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(out)
}

func idleClose(cfg config.Config) time.Duration {
	if cfg.SessionCloseAfter > 0 && cfg.SessionCloseAfter < time.Minute {
		return cfg.SessionCloseAfter / 2 // tests: close promptly
	}
	return 0 // default
}

// backfillSeen fills in when each site last sent an event, for databases that
// pre-date the column. Without it a site with years of history would read as
// "not installed yet" until its next visit.
func (s *Server) backfillSeen(ctx context.Context, store *duck.Store) {
	rows, err := store.DB.QueryContext(ctx, `SELECT site_id, epoch(max(ts)) FROM events GROUP BY site_id`)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var site string
		var last float64
		if err := rows.Scan(&site, &last); err != nil {
			return
		}
		s.ctl.SeenSite(ctx, site, int64(last))
	}
}

// hosting reports whether ip is on a network that only hosts servers. The
// network database is fetched the first time anyone asks, so an instance
// where no site uses stricter filtering never downloads it.
func (s *Server) hosting(ip string) bool {
	if s.asn == nil {
		return false
	}
	if !s.asn.Ready() {
		if ctx := s.bg.Load(); ctx != nil && s.asnStarted.CompareAndSwap(false, true) {
			go s.asn.Run(*ctx)
		}
		return false
	}
	return ingest.HostingASN(s.asn.ASN(ip))
}
