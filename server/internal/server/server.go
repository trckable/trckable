// Package server wires trckable together with a boot order that never loses
// data (plan §5.1):
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
	"github.com/trckable/trckable/server/internal/wal"
	"github.com/trckable/trckable/server/internal/web"
	"github.com/trckable/trckable/server/internal/writer"
)

// Version is set at build time (-ldflags "-X .../server.Version=v1.2.3").
var Version = "0.1.2" // the VERSION file; release builds stamp it too

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
	// remote is the bucket backups are copied to (TRCKABLE_BACKUP_S3), and
	// offsite how the last copy went.
	remote  *backup.Remote
	offsite atomic.Pointer[offsiteStatus]
}

// New performs boot steps 1–2 and prepares the listener.
func New(ctx context.Context, cfg config.Config) (*Server, error) {
	if err := os.MkdirAll(cfg.DataDir, 0o700); err != nil {
		return nil, fmt.Errorf("data dir: %w", err)
	}
	ctl, err := sqlite.Open(ctx, cfg.SQLitePath())
	if err != nil {
		return nil, fmt.Errorf("open control plane: %w", err)
	}
	for _, d := range cfg.Sites { // headless provisioning via TRCKABLE_SITES
		id, created, err := ctl.EnsureSite(ctx, sqlite.DefaultAccount, d)
		if err != nil {
			ctl.Close()
			return nil, fmt.Errorf("TRCKABLE_SITES %q: %w", d, err)
		}
		slog.Info("site", "domain", d, "id", id, "created", created)
	}
	lg, err := wal.Open(cfg.WALDir(), wal.Options{NoSync: cfg.WALNoSync})
	if err != nil {
		ctl.Close()
		return nil, fmt.Errorf("open wal: %w", err)
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
	if s.revenue, err = revenue.New(ctx, ctl.DB, box); err != nil {
		ctl.Close()
		lg.Close()
		return nil, fmt.Errorf("payments: %w", err)
	}
	a := &api.API{
		Ctl: ctl, Hub: s.hub, Token: cfg.APIToken, SetupEnv: cfg.SetupToken, ClientIP: s.ingest.ClientIP,
		Revenue: s.revenue, BaseURL: cfg.BaseURL, Box: box, Operator: cfg.OperatorToken, Managed: cfg.Managed, Version: Version, UpdateCheck: cfg.UpdateCheck && cfg.Managed == "",
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
	s.api = a
	// Off-site backups, when the owner names a bucket. A bad value is said
	// loudly and leaves backups local, rather than stopping the server.
	if r, err := backup.ParseRemote(cfg.BackupS3); err != nil {
		slog.Warn("off-site backups are off", "err", err)
	} else {
		s.remote = r
	}
	// Alerts by email, when the owner gives trckable an SMTP server to use.
	if cfg.SMTPURL != "" {
		if m, err := alerts.ParseMailer(cfg.SMTPURL, cfg.MailFrom); err != nil {
			slog.Warn("email alerts are off", "err", err)
		} else {
			alerts.Mail = m
		}
	}
	a.Routes(mux)
	s.revenue.OnChange = a.PurgeSite
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
	mux.HandleFunc("GET /_trckable/usage", s.usage)
	mux.HandleFunc("GET /_trckable/backup", s.backupNow)
	s.http = &http.Server{
		Addr:              cfg.Addr,
		Handler:           withHeaders(mux),
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
	if s.cfg.Managed != "" {
		slog.Info("managed: people sign in through the hosting provider", "signin", s.cfg.Managed)
		return
	}
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
	go s.runRetention(wctx) // each site's own "keep for N days"
	go s.runBackups(wctx)   // one encrypted copy a day, kept on the volume
	go s.runAlerts(wctx)    // the four things worth being told about

	select {
	case <-ctx.Done():
	case err := <-errc:
		s.shutdown()
		return err
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
		store, err = duck.Open(ctx, s.cfg.DuckPath(), duck.Options{Threads: s.cfg.DuckThreads, MemoryLimit: s.cfg.DuckMemory})
		if err == nil {
			break
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
	s.backfillSeen(ctx, store)
	w := writer.New(s.log, store, writer.Options{CloseAfter: s.cfg.SessionCloseAfter, IdleClose: idleClose(s.cfg)})
	w.OnCommit = s.hub.Publish
	s.writer.Store(w)
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
	werr := s.log.Close()        // commit every queued append
	s.stopWrite()                // writer drains what is durable, then returns
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
	code := http.StatusOK
	if err := s.log.Err(); err != nil {
		rd.Status, rd.Error, code = "unavailable", err.Error(), http.StatusServiceUnavailable
	} else if err := s.ctl.Ping(r.Context()); err != nil {
		rd.Status, rd.Error, code = "unavailable", err.Error(), http.StatusServiceUnavailable
	} else if v := s.writerErr.Load(); v != nil {
		rd.Status, rd.Error = "degraded", v.(error).Error() // events still durable in the WAL
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(rd)
}

// metrics exposes Prometheus text format with trckable_* names.
func (s *Server) metrics(w http.ResponseWriter, r *http.Request) {
	// Installation-wide counts: with an operator token set, they are the
	// operator's to read, not the internet's.
	if s.cfg.OperatorToken != "" && !auth.Equal(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), s.cfg.OperatorToken) {
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
	if os.Getenv("TRCKABLE_DEBUG_HEADERS") == "1" { // temporary, for deploy verification
		out["remote_addr"] = r.RemoteAddr
		out["x_forwarded_for"] = r.Header.Values("X-Forwarded-For")
		out["x_real_ip"] = r.Header.Get("X-Real-IP")
		out["x_envoy_external_address"] = r.Header.Get("X-Envoy-External-Address")
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(out)
}

func idleClose(cfg config.Config) time.Duration {
	if cfg.SessionCloseAfter > 0 && cfg.SessionCloseAfter < time.Minute {
		return cfg.SessionCloseAfter / 2 // tests: close promptly
	}
	return 0 // default
}

// Control exposes the control plane to CLI subcommands.
func (s *Server) Control() *sqlite.Store { return s.ctl }

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
