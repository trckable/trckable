// querybench seeds a DuckDB file with realistic synthetic traffic and times
// the Core dashboard queries (plan §10, M0 exit test: < 150 ms p95 at 10M
// events on 1 vCPU).
//
// usage: go run ./bench/querybench [-events 10000000] [-threads 1] [-db /tmp/x.duckdb]
package main

import (
	"context"
	"database/sql/driver"
	"flag"
	"fmt"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"sort"
	"time"

	duckdb "github.com/duckdb/duckdb-go/v2"

	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/duck"
)

var (
	total   = flag.Int("events", 10_000_000, "events to seed")
	threads = flag.Int("threads", 1, "DuckDB threads for the query run (1 ≈ one small vCPU)")
	dbPath  = flag.String("db", filepath.Join(os.TempDir(), "trckable-querybench.duckdb"), "database file (reused if it exists)")
	runs    = flag.Int("runs", 20, "timed runs per query")
)

var (
	channels  = []string{"Direct", "Search", "Social", "Referral", "AI", "Email", "Paid"}
	chWeight  = []float64{30, 28, 16, 12, 6, 5, 3}
	referrers = map[string][]string{
		"Search": {"google.com", "bing.com", "duckduckgo.com", "ecosia.org"},
		"Social": {"x.com", "reddit.com", "news.ycombinator.com", "linkedin.com", "youtube.com"},
		"AI":     {"chatgpt.com", "perplexity.ai", "claude.ai", "gemini.google.com"},
		"Email":  {"mail.google.com"},
		"Paid":   {"google.com"},
	}
	countries = []string{"US", "DE", "GB", "FR", "IN", "CA", "BR", "NL", "ES", "IT", "AL", "PL", "AU", "JP", "SE"}
	devices   = []string{"Desktop", "Mobile", "Tablet"}
	browsers  = []string{"Chrome", "Safari", "Firefox", "Edge", "Samsung Internet", "Instagram"}
	oses      = []string{"Windows", "macOS", "iOS", "Android", "Linux"}
	goals     = []string{"signup", "checkout_started", "newsletter", "download", "trial_started"}
)

func main() {
	flag.Parse()
	ctx := context.Background()
	if _, err := os.Stat(*dbPath); err != nil {
		seed(ctx)
	} else {
		fmt.Println("reusing", *dbPath)
	}
	store, err := duck.Open(ctx, *dbPath, duck.Options{Threads: 4, MemoryLimit: "1GB"}) // backfill only
	must(err)
	var n, ns int64
	store.DB.QueryRow(`SELECT count(*) FROM sessions`).Scan(&ns)
	if ns == 0 {
		t := time.Now()
		_, err := store.DB.Exec(`INSERT INTO sessions
			SELECT site_id, session_id, any_value(visitor_id), min(ts), max(ts), min(first_seen),
			       arg_min(channel, ts) FILTER (kind = 1), arg_min(referrer_host, ts) FILTER (kind = 1),
			       arg_min(path, ts) FILTER (kind = 1), arg_max(path, ts) FILTER (kind = 1),
			       arg_min(utm_campaign, ts) FILTER (kind = 1), arg_min(utm_source, ts) FILTER (kind = 1),
			       arg_min(utm_medium, ts) FILTER (kind = 1),
			       any_value(country), any_value(region), any_value(city),
			       any_value(device), any_value(browser), any_value(os), any_value(language),
			       count(*) FILTER (kind = 1), count(*) FILTER (kind = 2), 0, epoch(max(ts)) - epoch(min(ts))
			FROM events GROUP BY site_id, session_id HAVING count(*) FILTER (kind = 1) > 0
			ORDER BY min(ts)`)
		must(err)
		store.DB.QueryRow(`SELECT count(*) FROM sessions`).Scan(&ns)
		fmt.Printf("backfilled %d sessions in %s\n", ns, time.Since(t).Round(time.Millisecond))
	}
	store.DB.QueryRow(`SELECT count(*) FROM events`).Scan(&n)
	store.Close()
	// Measure with the production defaults: the given threads and a 256 MB cap.
	store, err = duck.Open(ctx, *dbPath, duck.Options{Threads: *threads, MemoryLimit: "256MB"})
	must(err)
	defer store.Close()
	st, _ := os.Stat(*dbPath)
	fmt.Printf("events: %d · file: %.0f MB (%.0f bytes/event) · threads: %d\n",
		n, float64(st.Size())/1e6, float64(st.Size())/float64(n), *threads)

	q := query.Q{DB: store.DB}
	now := time.Now().UTC().Truncate(time.Hour)
	for _, site := range []string{"tkb_big", "tkb_mid", "tkb_small"} {
		for _, days := range []int{1, 30, 90} {
			p := query.Params{Site: site, From: now.AddDate(0, 0, -days), To: now.Add(time.Hour), TZ: "Europe/Berlin"}
			fmt.Printf("\n%s, last %d day(s)\n", site, days)
			bench("full report", func() error { _, err := q.Report(ctx, p); return err })
			bench("filtered (channel)", func() error {
				fp := p
				fp.Filters = []query.Filter{{Dim: "channel", Value: "Search"}}
				_, err := q.Report(ctx, fp)
				return err
			})
			if days > 1 {
				bench("report + daily", func() error { dp := p; dp.Daily = true; _, err := q.Report(ctx, dp); return err })
			}
		}
	}
}

func bench(name string, f func() error) {
	var ds []time.Duration
	for i := 0; i < *runs; i++ {
		t := time.Now()
		must(f())
		ds = append(ds, time.Since(t))
	}
	sort.Slice(ds, func(i, j int) bool { return ds[i] < ds[j] })
	p50 := ds[len(ds)/2]
	p95 := ds[int(math.Ceil(float64(len(ds))*0.95))-1]
	flag := ""
	if p95 > 150*time.Millisecond {
		flag = "  ← over budget"
	}
	fmt.Printf("  %-18s p50 %6.1f ms   p95 %6.1f ms%s\n", name, ms(p50), ms(p95), flag)
}

func ms(d time.Duration) float64 { return float64(d.Microseconds()) / 1000 }

// seed writes realistic sessions in time order across three sites of skewed size.
func seed(ctx context.Context) {
	fmt.Printf("seeding %d events into %s …\n", *total, *dbPath)
	start := time.Now()
	store, err := duck.Open(ctx, *dbPath, duck.Options{Threads: 4, MemoryLimit: "1GB"})
	must(err)
	defer store.Close()
	conn, err := store.DB.Conn(ctx)
	must(err)
	defer conn.Close()

	rng := rand.New(rand.NewSource(42))
	sites := []struct {
		id    string
		share float64
		pages int
	}{{"tkb_big", 0.80, 400}, {"tkb_mid", 0.15, 120}, {"tkb_small", 0.05, 30}}
	days := 90
	end := time.Now().UTC()
	begin := end.AddDate(0, 0, -days)
	// Sessions per minute so that ~total events land evenly over the window.
	// A session yields ~2.9 events on average (48% bounce, else 2+Exp(2.5) pageviews, 4% goals).
	perMinute := float64(*total) / (float64(days) * 1440) / 2.9

	type sess struct {
		site    int
		visitor uint64
		first   time.Time
		ts      time.Time
		left    int
		ch, ref string
		country string
		dev     string
		br, os  string
		id      uint64
		page    int
	}
	var seq uint64
	written := 0
	must(conn.Raw(func(dc any) error {
		app, err := duckdb.NewAppenderFromConn(dc.(driver.Conn), "", "events")
		if err != nil {
			return err
		}
		defer app.Close()
		// Walk time forward; spawn sessions at a rate with a daily cycle.
		t := begin
		var active []*sess
		for written < *total {
			rate := perMinute * (1 + 0.6*math.Sin(float64(t.Hour())/24*2*math.Pi-1.5)) // daily cycle, mean 1
			spawn := int(rate)
			if rng.Float64() < rate-float64(spawn) {
				spawn++
			}
			for i := 0; i < spawn; i++ {
				si := pickSite(rng, sites[0].share, sites[1].share)
				ch := pick(rng, channels, chWeight)
				ref := ""
				if rs, ok := referrers[ch]; ok {
					ref = rs[rng.Intn(len(rs))]
				} else if ch == "Referral" {
					ref = fmt.Sprintf("blog%d.dev", rng.Intn(300))
				}
				pvs := 1
				if rng.Float64() > 0.48 { // ~48% bounce
					pvs = 2 + int(rng.ExpFloat64()*2.5)
				}
				visitor := uint64(rng.Int63n(int64(float64(*total)/6))) + 1
				first := t.Add(-time.Duration(rng.Intn(60*24)) * time.Hour)
				active = append(active, &sess{
					site: si, visitor: visitor, first: first, ts: t, left: pvs, ch: ch, ref: ref,
					country: countries[zipf(rng, len(countries))], dev: pick(rng, devices, []float64{58, 38, 4}),
					br: browsers[zipf(rng, len(browsers))], os: oses[rng.Intn(len(oses))],
					id: rng.Uint64(), page: zipf(rng, sites[si].pages),
				})
			}
			next := active[:0]
			for _, s := range active {
				if s.ts.After(t.Add(time.Minute)) {
					next = append(next, s)
					continue
				}
				seq++
				kind := uint8(1)
				var goal any
				if rng.Float64() < 0.04 {
					kind, goal = 2, goals[zipf(rng, len(goals))]
				}
				var ref, ch any
				if s.ref != "" {
					ref = s.ref
				}
				ch = s.ch
				if err := app.AppendRow(seq, sites[s.site].id, s.ts, kind, rng.Uint64(), s.visitor, s.first, s.id, rng.Uint64(),
					"example.com", fmt.Sprintf("/p/%d", s.page), ref, nil, ch,
					nil, nil, nil, nil, nil, s.country, nil, nil, s.br, s.os, s.dev, "en", uint16(1440),
					goal, nil, nil, nil); err != nil {
					return err
				}
				written++
				if kind == 1 {
					s.left--
				}
				if s.left > 0 {
					s.ts = s.ts.Add(time.Duration(10+rng.Intn(170)) * time.Second)
					s.page = zipf(rng, sites[s.site].pages)
					next = append(next, s)
				}
			}
			active = next
			t = t.Add(time.Minute)
			if t.After(end) {
				break // never pile events onto "now"
			}
		}
		return nil
	}))
	fmt.Printf("seeded %d events in %s\n", written, time.Since(start).Round(time.Second))
}

func pickSite(rng *rand.Rand, big, mid float64) int {
	x := rng.Float64()
	switch {
	case x < big:
		return 0
	case x < big+mid:
		return 1
	}
	return 2
}

func pick(rng *rand.Rand, vals []string, w []float64) string {
	var sum float64
	for _, x := range w {
		sum += x
	}
	r := rng.Float64() * sum
	for i, x := range w {
		if r < x {
			return vals[i]
		}
		r -= x
	}
	return vals[len(vals)-1]
}

// zipf picks an index with a long-tail distribution.
func zipf(rng *rand.Rand, n int) int {
	i := int(float64(n) * math.Pow(rng.Float64(), 2.2))
	if i >= n {
		i = n - 1
	}
	return i
}

func must(err error) {
	if err != nil {
		fmt.Println("error:", err)
		os.Exit(1)
	}
}
