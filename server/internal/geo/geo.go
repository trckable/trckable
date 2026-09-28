// Package geo resolves an IP address to country (and optionally region and
// city) using the free DB-IP Lite databases (CC BY 4.0 — the dashboard shows
// the required "IP geolocation by DB-IP" credit).
//
// Lightweight by default: the country database is ~4 MB. TRCKABLE_GEO=city
// opts into the ~130 MB city database. The file is downloaded in the
// background on first boot and refreshed monthly; until it is available,
// lookups simply return nothing. Lookups never block ingest and never store
// the IP.
package geo

import (
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/netip"
	"os"
	"path/filepath"
	"sync/atomic"
	"time"

	"github.com/oschwald/maxminddb-golang/v2"
)

// Mode selects the database.
type Mode string

const (
	Off     Mode = "off"
	Country Mode = "country"
	City    Mode = "city"
	// ASN is the network database: which provider an address belongs to.
	ASN Mode = "asn"
)

// Location is the result of a lookup.
type Location struct {
	Country string // ISO 3166-1 alpha-2
	Region  string
	City    string
}

// DB is a hot-swappable geo database.
type DB struct {
	mode   Mode
	dir    string
	reader atomic.Pointer[maxminddb.Reader]
	// URL returns the download URL for a month (overridable in tests).
	URL    func(Mode, time.Time) string
	Client *http.Client
	// Shared means the directory is kept up to date by someone else (another
	// process, `trckabled geo update`, a machine running many instances): this
	// DB only reads it, and picks up a newer file when one appears. Many
	// instances then map one file, so the memory is paid once.
	Shared bool
	loaded atomic.Int64 // modification time of the file in use, unix nanoseconds
}

// New creates a DB for mode storing files in dir. Call Load, then Run.
func New(mode Mode, dir string) *DB {
	if mode == "" {
		mode = Country
	}
	return &DB{
		mode: mode,
		dir:  dir,
		URL: func(m Mode, t time.Time) string {
			return fmt.Sprintf("https://download.db-ip.com/free/dbip-%s-lite-%s.mmdb.gz", m, t.Format("2006-01"))
		},
		Client: &http.Client{Timeout: 5 * time.Minute},
	}
}

func (g *DB) path() string { return filepath.Join(g.dir, fmt.Sprintf("dbip-%s-lite.mmdb", g.mode)) }

// Load opens an existing database file, if present.
func (g *DB) Load() error {
	if g.mode == Off {
		return nil
	}
	st, err := os.Stat(g.path())
	if err != nil {
		return err
	}
	r, err := maxminddb.Open(g.path())
	if err != nil {
		return err
	}
	g.loaded.Store(st.ModTime().UnixNano())
	g.swap(r)
	return nil
}

func (g *DB) swap(r *maxminddb.Reader) {
	if old := g.reader.Swap(r); old != nil {
		// Give in-flight lookups a moment before unmapping the old file.
		time.AfterFunc(time.Minute, func() { old.Close() })
	}
}

// Ready reports whether lookups are available.
func (g *DB) Ready() bool { return g.reader.Load() != nil }

type record struct {
	Country struct {
		ISOCode string `maxminddb:"iso_code"`
	} `maxminddb:"country"`
	Subdivisions []struct {
		Names map[string]string `maxminddb:"names"`
	} `maxminddb:"subdivisions"`
	City struct {
		Names map[string]string `maxminddb:"names"`
	} `maxminddb:"city"`
}

// Lookup resolves ip. It returns a zero Location when unavailable.
func (g *DB) Lookup(ip string) Location {
	r := g.reader.Load()
	if r == nil {
		return Location{}
	}
	addr, err := netip.ParseAddr(ip)
	if err != nil || addr.IsPrivate() || addr.IsLoopback() {
		return Location{}
	}
	var rec record
	if err := r.Lookup(addr.Unmap()).Decode(&rec); err != nil {
		return Location{}
	}
	loc := Location{Country: rec.Country.ISOCode, City: rec.City.Names["en"]}
	if len(rec.Subdivisions) > 0 {
		loc.Region = rec.Subdivisions[0].Names["en"]
	}
	return loc
}

// ASN is the autonomous system (the network) an address belongs to, for a DB
// opened in "asn" mode. 0 when unknown or unavailable.
func (g *DB) ASN(ip string) uint32 {
	r := g.reader.Load()
	if r == nil {
		return 0
	}
	addr, err := netip.ParseAddr(ip)
	if err != nil || addr.IsPrivate() || addr.IsLoopback() {
		return 0
	}
	var rec struct {
		ASN uint32 `maxminddb:"autonomous_system_number"`
	}
	if err := r.Lookup(addr.Unmap()).Decode(&rec); err != nil {
		return 0
	}
	return rec.ASN
}

// Run keeps the database present and fresh: it downloads immediately if the
// file is missing or older than 32 days, then checks daily.
func (g *DB) Run(ctx context.Context) {
	if g.mode == Off {
		return
	}
	if g.Shared {
		g.follow(ctx)
		return
	}
	for {
		if st, err := os.Stat(g.path()); err != nil || time.Since(st.ModTime()) > 32*24*time.Hour {
			if err := g.refresh(ctx); err != nil {
				slog.Warn("geo database download failed; will retry", "mode", g.mode, "err", err)
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(24 * time.Hour):
		}
	}
}

// follow reloads a shared file whenever it is replaced. Nothing is downloaded:
// a shared directory belongs to whoever keeps it fresh.
func (g *DB) follow(ctx context.Context) {
	warned := false
	for {
		if st, err := os.Stat(g.path()); err == nil {
			if st.ModTime().UnixNano() != g.loaded.Load() {
				if err := g.Load(); err != nil {
					slog.Warn("shared geo database could not be opened", "path", g.path(), "err", err)
				} else {
					slog.Info("geo database loaded", "mode", g.mode, "path", g.path())
				}
			}
		} else if !warned {
			slog.Warn("shared geo database is missing; run `trckabled geo update` for that directory", "path", g.path())
			warned = true
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(followEvery):
		}
	}
}

// followEvery is how often a shared file is checked for a newer copy.
var followEvery = 10 * time.Minute

// Update downloads the database into its directory now, whatever its age.
// It is what `trckabled geo update` runs for a shared directory.
func (g *DB) Update(ctx context.Context) error { return g.refresh(ctx) }

// refresh downloads this month's database (falling back to last month's,
// which exists early in a month), verifies it opens, then swaps it in atomically.
func (g *DB) refresh(ctx context.Context) error {
	if err := os.MkdirAll(g.dir, 0o700); err != nil {
		return err
	}
	now := time.Now().UTC()
	var lastErr error
	for _, month := range []time.Time{now, now.AddDate(0, -1, 0)} {
		tmp, err := g.download(ctx, g.URL(g.mode, month))
		if err != nil {
			lastErr = err
			continue
		}
		r, err := maxminddb.Open(tmp)
		if err != nil {
			os.Remove(tmp)
			lastErr = fmt.Errorf("downloaded database is invalid: %w", err)
			continue
		}
		r.Close()
		if err := os.Rename(tmp, g.path()); err != nil {
			os.Remove(tmp)
			return err
		}
		if err := g.Load(); err != nil {
			return err
		}
		slog.Info("geo database ready", "mode", g.mode, "month", month.Format("2006-01"))
		return nil
	}
	return lastErr
}

func (g *DB) download(ctx context.Context, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "trckable (+https://trckable.com)")
	resp, err := g.Client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GET %s: %s", url, resp.Status)
	}
	zr, err := gzip.NewReader(resp.Body)
	if err != nil {
		return "", err
	}
	f, err := os.CreateTemp(g.dir, "download-*.mmdb")
	if err != nil {
		return "", err
	}
	_, cerr := io.Copy(f, io.LimitReader(zr, 1<<30))
	serr := f.Sync()
	f.Close()
	if cerr != nil || serr != nil {
		os.Remove(f.Name())
		return "", fmt.Errorf("download: %v %v", cerr, serr)
	}
	return f.Name(), nil
}
