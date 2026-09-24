// demoseed fills a data directory with realistic history for demos,
// screenshots and dashboard development. Events go through the real pipeline:
// they are appended to the WAL and the server's writer sessionizes them on
// the next start, exactly like live traffic.
//
// usage: go run ./bench/demoseed -data ./data -domain demo.trckable.com [-days 120] [-daily 450]
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/revenue"
	"github.com/trckable/trckable/server/internal/secrets"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/wal"
)

var (
	dataDir = flag.String("data", "./data", "trckable data directory (the server must be stopped)")
	domain  = flag.String("domain", "demo.trckable.com", "site domain")
	days    = flag.Int("days", 120, "days of history, ending now")
	daily   = flag.Int("daily", 450, "visitors on an average weekday at the start")
	pay     = flag.Bool("payments", true, "also seed Stripe payments (through the real webhook inbox)")
	seed    = flag.Int64("seed", 7, "random seed (same seed, same data)")
)

type channel struct {
	name   string
	share  float64
	refs   []string
	growth float64 // share multiplier at the end of the period
	pages  []string
}

var channels = []channel{
	{"Direct", 0.30, nil, 1, []string{"/", "/pricing", "/docs"}},
	{"Search", 0.28, []string{"google.com", "bing.com", "duckduckgo.com", "ecosia.org"}, 1.1, []string{"/blog/self-hosted-analytics", "/docs", "/", "/blog/ai-traffic"}},
	{"Social", 0.16, []string{"x.com", "reddit.com", "linkedin.com", "youtube.com", "bsky.app"}, 1, []string{"/", "/blog/ai-traffic", "/changelog"}},
	{"Referral", 0.12, []string{"github.com", "producthunt.com", "indiehackers.com", "dev.to"}, 1, []string{"/", "/pricing", "/docs"}},
	{"AI", 0.06, []string{"chatgpt.com", "perplexity.ai", "claude.ai", "gemini.google.com"}, 2.4, []string{"/pricing", "/docs", "/blog/ai-traffic"}},
	{"Email", 0.05, []string{"mail.google.com"}, 1, []string{"/changelog", "/blog/self-hosted-analytics"}},
	{"Paid", 0.03, []string{"google.com"}, 1, []string{"/pricing", "/features"}},
}

var (
	pages     = []string{"/", "/pricing", "/docs", "/features", "/blog/self-hosted-analytics", "/blog/ai-traffic", "/changelog", "/about", "/docs/install", "/docs/revenue"}
	countries = []struct {
		code, city string
		w          float64
	}{{"US", "New York", 31}, {"DE", "Berlin", 12}, {"GB", "London", 9}, {"FR", "Paris", 6}, {"IN", "Bengaluru", 6}, {"CA", "Toronto", 5}, {"NL", "Amsterdam", 4}, {"BR", "São Paulo", 4}, {"AL", "Tirana", 3}, {"ES", "Madrid", 3}, {"PL", "Warsaw", 3}, {"JP", "Tokyo", 3}, {"AU", "Sydney", 3}, {"SE", "Stockholm", 2}, {"IT", "Milan", 2}}
	devices = []struct {
		dev, os, br string
		w           float64
	}{{"Desktop", "macOS", "Chrome", 22}, {"Desktop", "Windows", "Chrome", 20}, {"Desktop", "macOS", "Safari", 9}, {"Desktop", "Windows", "Edge", 6}, {"Desktop", "Linux", "Firefox", 5}, {"Mobile", "iOS", "Safari", 18}, {"Mobile", "Android", "Chrome", 12}, {"Mobile", "iOS", "Instagram", 3}, {"Mobile", "Android", "Samsung Internet", 2}, {"Tablet", "iOS", "Safari", 3}}
	campaigns = []string{"launch_week", "newsletter_sep", "producthunt", "yt_review", "partner_acme"}
	goals     = []string{"signup", "checkout_started", "trial_started", "newsletter", "file_download"}
)

func main() {
	flag.Parse()
	ctx := context.Background()
	must(os.MkdirAll(*dataDir, 0o700))
	ctl, err := sqlite.Open(ctx, filepath.Join(*dataDir, "trckable.db"))
	must(err)
	site, _, err := ctl.EnsureSite(ctx, sqlite.DefaultAccount, *domain)
	must(err)
	ctl.Close()

	rng := rand.New(rand.NewSource(*seed))
	now := time.Now()
	start := now.AddDate(0, 0, -*days).Truncate(24 * time.Hour)
	spike := *days - 13 // a launch post that took off on LinkedIn, two weeks ago
	var evs []event.Event
	var buys []purchase
	var id uint64 = uint64(now.UnixNano())
	returning := make([]uint64, 0, 4096) // visitors who come back
	firstSeen := map[uint64]int64{}

	for d := 0; d <= *days; d++ {
		day := start.AddDate(0, 0, d)
		progress := float64(d) / float64(*days)
		weekly := 1.05
		if wd := day.Weekday(); wd == time.Saturday || wd == time.Sunday {
			weekly = 0.7
		}
		boost := 1.0
		if d == spike {
			boost = 2.8
		} else if d == spike+1 {
			boost = 1.6
		}
		n := int(float64(*daily) * (1 + progress*0.6) * weekly * boost * (0.88 + rng.Float64()*0.24))
		for v := 0; v < n; v++ {
			ts := day.Add(hourOfDay(rng))
			if ts.After(now) {
				continue
			}
			var visitor uint64
			if len(returning) > 50 && rng.Float64() < 0.28 {
				visitor = returning[rng.Intn(len(returning))]
			} else {
				visitor = rng.Uint64()
				if rng.Float64() < 0.3 {
					returning = append(returning, visitor)
				}
			}
			if _, ok := firstSeen[visitor]; !ok {
				firstSeen[visitor] = ts.UnixMilli()
			}
			ch := pickChannel(rng, progress, d == spike || d == spike+1)
			ref := ""
			if len(ch.refs) > 0 {
				ref = ch.refs[rng.Intn(len(ch.refs))]
				if ch.name == "Social" && (d == spike || d == spike+1) && rng.Float64() < 0.8 {
					ref = "www.linkedin.com"
				}
			}
			var utm string
			if ch.name == "Email" || ch.name == "Paid" || rng.Float64() < 0.05 {
				utm = campaigns[rng.Intn(len(campaigns))]
			}
			c := countries[weighted(rng, len(countries), func(i int) float64 { return countries[i].w })]
			dv := devices[weighted(rng, len(devices), func(i int) float64 { return devices[i].w })]
			pvs := 1
			if rng.Float64() > 0.48 {
				pvs = 2 + int(rng.ExpFloat64()*1.6)
			}
			if d == spike && ch.name == "Social" && rng.Float64() < 0.4 {
				pvs = 1
			}
			path := ch.pages[rng.Intn(len(ch.pages))]
			if rng.Float64() < buyRate[ch.name]*(0.8+0.4*progress) {
				buys = append(buys, purchase{visitor: visitor, at: ts.Add(time.Duration(2+rng.Intn(20)) * time.Minute), rng: rng.Int63()})
			}
			for p := 0; p < pvs && p < 12; p++ {
				id++
				pv := id
				e := event.Event{Site: site, Kind: event.KindPageview, EventID: id, TS: ts.UnixMilli(), Visitor: visitor, FirstSeen: firstSeen[visitor], Pageview: pv,
					Hostname: *domain, Path: path, Country: c.code, City: c.city, Device: dv.dev, OS: dv.os, Browser: dv.br, Language: "en"}
				if p == 0 {
					e.Channel, e.RefHost, e.UTMCampaign = ch.name, ref, utm
					if utm != "" {
						e.UTMSource, e.UTMMedium = "newsletter", "email"
					}
				} else {
					e.Channel = "Direct"
				}
				evs = append(evs, e)
				eng := uint32(5000 + rng.ExpFloat64()*40000)
				ts = ts.Add(time.Duration(eng) * time.Millisecond)
				id++
				evs = append(evs, event.Event{Site: site, Kind: event.KindEngagement, EventID: id, TS: ts.UnixMilli(), Visitor: visitor, Pageview: pv, Hostname: *domain, Path: path, EngagedMs: eng, ScrollPct: depthFor(path, rng)})
				if rng.Float64() < 0.06 {
					id++
					g := goals[weighted(rng, len(goals), func(i int) float64 { return 1 / float64(i+1) })]
					evs = append(evs, event.Event{Site: site, Kind: event.KindGoal, EventID: id, TS: ts.UnixMilli(), Visitor: visitor, Pageview: pv, Hostname: *domain, Path: path, Goal: g})
				}
				path = pages[zipf(rng, len(pages))]
				ts = ts.Add(time.Duration(2+rng.Intn(20)) * time.Second)
			}
		}
	}
	sort.SliceStable(evs, func(i, j int) bool { return evs[i].TS < evs[j].TS })
	for i := range evs { // the WAL is in time order; nothing may be in the future
		if evs[i].TS > now.UnixMilli() {
			evs = evs[:i]
			break
		}
	}

	lg, err := wal.Open(filepath.Join(*dataDir, "wal"), wal.Options{NoSync: true})
	must(err)
	for i := range evs {
		b, _ := evs[i].Marshal()
		if _, err := lg.Append(ctx, b); err != nil {
			must(err)
		}
	}
	must(lg.Close())
	fmt.Printf("site %s (%s): %d events over %d days appended to the WAL; start trckabled to ingest them\n", *domain, site, len(evs), *days)
	if *pay {
		n := seedPayments(ctx, site, buys, now)
		fmt.Printf("payments: %d Stripe webhooks in the inbox (connection \"Demo Stripe\")\n", n)
	}
}

// Buyers per visit by channel: AI assistants and email convert best.
var buyRate = map[string]float64{"AI": 0.045, "Email": 0.05, "Referral": 0.03, "Search": 0.022, "Paid": 0.02, "Direct": 0.018, "Social": 0.007}

type purchase struct {
	visitor uint64
	at      time.Time
	rng     int64
}

// seedPayments writes Stripe-shaped webhooks straight into the inbox of a
// demo connection: the server's processor turns them into ledger facts on
// start, exactly like delivered webhooks.
func seedPayments(ctx context.Context, site string, buys []purchase, now time.Time) int {
	ctl, err := sqlite.Open(ctx, filepath.Join(*dataDir, "trckable.db"))
	must(err)
	defer ctl.Close()
	box, err := secrets.Load(*dataDir, os.Getenv("TRCKABLE_SECRET"))
	must(err)
	svc, err := revenue.New(ctx, ctl.DB, box)
	must(err)
	conn, err := svc.Connect(ctx, revenue.ConnectRequest{Site: site, Provider: "stripe", Secret: "whsec_demo_only"})
	must(err)
	n := 0
	add := func(key string, v any) {
		b, _ := json.Marshal(v)
		_, err := ctl.DB.ExecContext(ctx, `INSERT OR IGNORE INTO pay_inbox (connection_id, event_key, received_at, source, body) VALUES (?, ?, ?, 'webhook', ?)`, conn.ID, key, now.UnixMilli(), b)
		must(err)
		n++
	}
	obj := func(evID, typ string, at time.Time, o map[string]any) map[string]any {
		return map[string]any{"id": evID, "object": "event", "type": typ, "created": at.Unix(), "livemode": true, "data": map[string]any{"object": o}}
	}
	plans := []struct {
		price int64
		sub   bool
	}{{1900, true}, {4900, true}, {9900, false}, {4900, false}, {2900, true}}
	for i, b := range buys {
		if b.at.After(now) {
			continue
		}
		r := rand.New(rand.NewSource(b.rng))
		plan := plans[r.Intn(len(plans))]
		taxRate := []float64{0, 0.19, 0.2, 0.08}[r.Intn(4)]
		tax := int64(float64(plan.price) * taxRate)
		vid := strconv.FormatUint(b.visitor, 36) + ".demo"
		cus := fmt.Sprintf("cus_demo%d", i)
		pi := fmt.Sprintf("pi_demo%d", i)
		if !plan.sub {
			add("evt_cs"+pi, obj("evt_cs"+pi, "checkout.session.completed", b.at, map[string]any{"id": "cs_" + pi, "mode": "payment", "payment_intent": pi, "customer": cus,
				"metadata": map[string]any{"trckable_vid": vid}, "total_details": map[string]any{"amount_tax": tax}}))
			add("evt_"+pi, obj("evt_"+pi, "payment_intent.succeeded", b.at, map[string]any{"id": pi, "amount_received": plan.price + tax, "currency": "usd", "customer": cus}))
			if r.Float64() < 0.05 {
				add("evt_re"+pi, obj("evt_re"+pi, "refund.created", b.at.Add(48*time.Hour), map[string]any{"id": "re_" + pi, "amount": (plan.price + tax) / 2, "currency": "usd", "payment_intent": pi, "status": "succeeded"}))
			}
			continue
		}
		sub := fmt.Sprintf("sub_demo%d", i)
		months := 0
		for at := b.at; at.Before(now); at = at.AddDate(0, 1, 0) {
			if months > 0 && r.Float64() < 0.12 {
				break // churned
			}
			inv := fmt.Sprintf("in_demo%d_%d", i, months)
			p := fmt.Sprintf("%s_%d", pi, months)
			reason := "subscription_cycle"
			if months == 0 {
				reason = "subscription_create"
				add("evt_cs"+p, obj("evt_cs"+p, "checkout.session.completed", at, map[string]any{"id": "cs_" + p, "mode": "subscription", "invoice": inv, "subscription": sub, "customer": cus,
					"metadata": map[string]any{"trckable_vid": vid}, "total_details": map[string]any{"amount_tax": tax}}))
			}
			add("evt_in"+p, obj("evt_in"+p, "invoice.paid", at, map[string]any{"id": inv, "billing_reason": reason, "customer": cus,
				"total_taxes": []map[string]any{{"amount": tax}}, "parent": map[string]any{"subscription_details": map[string]any{"subscription": sub, "metadata": map[string]any{}}}}))
			add("evt_ip"+p, obj("evt_ip"+p, "invoice_payment.paid", at, map[string]any{"invoice": inv, "payment": map[string]any{"type": "payment_intent", "payment_intent": p}}))
			add("evt_"+p, obj("evt_"+p, "payment_intent.succeeded", at, map[string]any{"id": p, "amount_received": plan.price + tax, "currency": "usd", "customer": cus}))
			months++
		}
	}
	return n
}

func pickChannel(rng *rand.Rand, progress float64, spike bool) channel {
	w := func(i int) float64 {
		c := channels[i]
		s := c.share * (1 + (c.growth-1)*progress)
		if spike && c.name == "Social" {
			s += 0.5
		}
		return s
	}
	return channels[weighted(rng, len(channels), w)]
}

// hourOfDay: a working-day curve peaking mid-afternoon, with an evening bump.
func hourOfDay(rng *rand.Rand) time.Duration {
	for {
		h := rng.Float64() * 24
		p := math.Exp(-math.Pow((h-14)/4.2, 2)) + 0.35*math.Exp(-math.Pow((h-21)/2.2, 2)) + 0.05
		if rng.Float64()*1.4 < p {
			return time.Duration(h * float64(time.Hour))
		}
	}
}

func weighted(rng *rand.Rand, n int, w func(int) float64) int {
	var sum float64
	for i := 0; i < n; i++ {
		sum += w(i)
	}
	r := rng.Float64() * sum
	for i := 0; i < n; i++ {
		if r -= w(i); r <= 0 {
			return i
		}
	}
	return n - 1
}

func zipf(rng *rand.Rand, n int) int {
	return weighted(rng, n, func(i int) float64 { return 1 / float64(i+1) })
}

func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// depthFor gives each kind of page its own reading depth, so the Scroll tab
// has something to say: long reads get read, the homepage gets skimmed.
func depthFor(path string, rng *rand.Rand) uint8 {
	lo, span := 25, 60
	switch {
	case strings.HasPrefix(path, "/docs"):
		lo, span = 55, 45
	case strings.HasPrefix(path, "/blog"):
		lo, span = 35, 65
	case path == "/pricing":
		lo, span = 45, 55
	case path == "/":
		lo, span = 15, 55
	}
	d := lo + rng.Intn(span+1)
	if d > 100 {
		d = 100
	}
	return uint8(d)
}
