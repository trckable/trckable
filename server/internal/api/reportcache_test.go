package api

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// The report cache holds closed ranges for hours, so it has to drop exactly
// what a change can reach: every answer it gives must be the answer a fresh
// read would give. This asks many random reports, changes the data in every
// way the product can, and after each change compares every report the cache
// serves with the one it computes from scratch, byte for byte.
type golden struct {
	t      *testing.T
	g      *rig
	c      *http.Client
	base   string
	nextID uint64
	secret string
	conn   string
	// The same instance's data through a second server whose cache is emptied
	// before every read: what a report says when nothing is cached.
	cold    *API
	coldURL string
}

func newGolden(t *testing.T) *golden {
	t.Helper()
	g := newRig(t)
	c := client()
	g.setup(t, c)
	// Just after midnight UTC: yesterday's last visits are still open.
	g.clock.Store(time.Date(2026, 9, 22, 0, 5, 0, 0, time.UTC).UnixMilli())
	base := g.srv.URL + "/api/v1/sites/" + g.site
	_, conn := do(t, c, "POST", base+"/payments", `{"provider":"custom"}`, csrf, "1")
	_, sec := do(t, c, "GET", base+"/payments/"+conn["id"].(string)+"/secret", "")
	do(t, c, "PUT", base+"/modules/revenue", `{"enabled":true}`, csrf, "1")
	a := g.api
	cold := &API{Ctl: a.Ctl, Hub: a.Hub, Token: a.Token, SetupEnv: a.SetupEnv, Now: a.Now, Revenue: a.Revenue, Box: a.Box, Query: a.Query}
	mux := http.NewServeMux()
	cold.Routes(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return &golden{t: t, g: g, c: c, base: base, secret: sec["secret"].(string), conn: conn["id"].(string), cold: cold, coldURL: srv.URL + "/api/v1/sites/" + g.site}
}

func (o *golden) now() time.Time { return time.UnixMilli(o.g.clock.Load()).UTC() }

// visit writes a pageview (and, sometimes, a goal) for a visitor at a moment.
func (o *golden) visit(at time.Time, visitor uint64, channel, country, path string, goal bool) {
	o.t.Helper()
	o.nextID++
	o.g.event(o.t, event.Event{Kind: event.KindPageview, EventID: o.nextID, TS: at.UnixMilli(), Visitor: visitor, Pageview: o.nextID, Path: path, Channel: channel, Country: country})
	if goal {
		o.nextID++
		o.g.event(o.t, event.Event{Kind: event.KindGoal, EventID: o.nextID, TS: at.Add(time.Second).UnixMilli(), Visitor: visitor, Goal: "signup"})
	}
}

func (o *golden) applied() { o.t.Helper(); o.g.waitApplied(o.t, o.nextID) }

// webhook sends a signed custom-provider event and lets the ledger take it.
func (o *golden) webhook(body string) {
	o.t.Helper()
	ts := time.Now().Unix()
	m := hmac.New(sha256.New, []byte(o.secret))
	fmt.Fprintf(m, "%d.%s", ts, body)
	req, _ := http.NewRequest("POST", o.g.srv.URL+"/webhooks/custom/"+o.conn, strings.NewReader(body))
	req.Header.Set("Trckable-Timestamp", strconv.FormatInt(ts, 10))
	req.Header.Set("Trckable-Signature", "v1="+hex.EncodeToString(m.Sum(nil)))
	res, err := http.DefaultClient.Do(req)
	if err != nil || res.StatusCode != http.StatusOK {
		o.t.Fatalf("webhook: %v %v", res, err)
	}
	res.Body.Close()
	if _, err := o.g.rev.Process(context.Background()); err != nil {
		o.t.Fatal(err)
	}
}

func (o *golden) sale(id string, at time.Time, visitor uint64, amount int64) {
	o.t.Helper()
	o.webhook(fmt.Sprintf(`{"id":"evt_%s","type":"payment","at":%d,"payment":{"id":"%s","amount":%d,"currency":"usd","visitor":"%s"}}`,
		id, at.Unix(), id, amount, strconv.FormatUint(visitor, 36)))
}

// get reads one report's bytes.
func (o *golden) get(q string) []byte {
	o.t.Helper()
	res, err := o.c.Get(o.base + "/report?" + q)
	if err != nil {
		o.t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK {
		o.t.Fatalf("report %s: %d %s", q, res.StatusCode, b)
	}
	return b
}

// fresh reads it with nothing cached: the answer a cache has to equal. The
// cache being tested is not touched, so what it holds is what it is asked.
func (o *golden) fresh(q string) []byte {
	o.t.Helper()
	o.cold.cache.purgeAll()
	req, _ := http.NewRequest("GET", o.coldURL+"/report?"+q, nil)
	req.Header.Set("Authorization", "Bearer "+o.g.api.Token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		o.t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK {
		o.t.Fatalf("fresh report %s: %d %s", q, res.StatusCode, b)
	}
	return b
}

// reports builds a varied set of report queries: zones whose midnights fall on
// different instants, ranges ending yesterday, today and long ago, every bucket,
// every comparison, filters on sessions, pages and goals, per-day data.
func (o *golden) reports(n int, seed int64) []string {
	rnd := rand.New(rand.NewSource(seed)) //nolint:gosec // seeded so the queries are repeatable, not security
	zones := []string{"UTC", "Pacific/Auckland", "America/Los_Angeles", "Asia/Kolkata", "Europe/Berlin"}
	filters := []string{"", "channel:Search", "country:DE", "page:/pricing", "goal:signup", "device:Mobile"}
	buckets := []string{"", "", "day", "week", "month", "hour"}
	compares := []string{"", "", "previous", "year", "custom"}
	var out []string
	for len(out) < n {
		tz := zones[rnd.Intn(len(zones))]
		loc, _ := time.LoadLocation(tz)
		today := time.Date(o.now().In(loc).Year(), o.now().In(loc).Month(), o.now().In(loc).Day(), 12, 0, 0, 0, time.UTC)
		day := func(back int) string { return today.AddDate(0, 0, -back).Format("2006-01-02") }
		to := rnd.Intn(4) // 0 = today, 1 = yesterday, more = earlier
		if rnd.Intn(3) == 0 {
			to = rnd.Intn(30)
		}
		from := to + rnd.Intn(40)
		v := url.Values{}
		v.Set("from", day(from))
		v.Set("to", day(to))
		v.Set("tz", tz)
		if b := buckets[rnd.Intn(len(buckets))]; b != "" && (b != "hour" || from-to <= 10) {
			v.Set("bucket", b)
		}
		if c := compares[rnd.Intn(len(compares))]; c != "" {
			v.Set("compare", c)
			if c == "custom" {
				ct := rnd.Intn(20)
				v.Set("cfrom", day(ct+rnd.Intn(15)))
				v.Set("cto", day(ct))
			}
		}
		if f := filters[rnd.Intn(len(filters))]; f != "" {
			v.Add("f", f)
		}
		if rnd.Intn(2) == 0 {
			v.Set("daily", "1")
		}
		if rnd.Intn(4) == 0 {
			v.Set("deep", "1")
		}
		out = append(out, v.Encode())
	}
	return out
}

// same fails the test for every report the cache serves differently from a
// fresh read.
func (o *golden) same(qs []string, after string) {
	o.t.Helper()
	for _, q := range qs {
		cached := o.get(q)
		if fresh := o.fresh(q); !bytes.Equal(cached, fresh) {
			o.t.Fatalf("after %s, the cached report differs from a fresh read\n  %s\n  cached %.400s\n  fresh  %.400s", after, q, cached, fresh)
		}
	}
}

// warm asks every report once, so the cache holds them.
func (o *golden) warm(qs []string) int {
	for _, q := range qs {
		o.get(q)
	}
	o.g.api.cache.mu.Lock()
	defer o.g.api.cache.mu.Unlock()
	return len(o.g.api.cache.m)
}

func TestReportCacheNeverDiffersFromAFreshRead(t *testing.T) {
	o := newGolden(t)
	rnd := rand.New(rand.NewSource(11)) //nolint:gosec // seeded so the traffic is repeatable, not security
	channels := []string{"Search", "Social", "Direct", "AI", "Referral"}
	paths := []string{"/", "/pricing", "/docs", "/blog/x"}
	countries := []string{"DE", "US", "IN", "NZ"}
	// Fifty days of visits, at every hour, from people who come back.
	for d := 50; d >= 1; d-- {
		for i := 0; i < 5; i++ {
			at := time.Date(2026, 9, 22-d, rnd.Intn(24), rnd.Intn(60), 0, 0, time.UTC)
			who := 1 + rnd.Uint64()%40
			o.visit(at, who, channels[rnd.Intn(len(channels))], countries[rnd.Intn(len(countries))], paths[rnd.Intn(len(paths))], rnd.Intn(5) == 0)
			if rnd.Intn(2) == 0 {
				o.visit(at.Add(5*time.Minute), who, channels[rnd.Intn(len(channels))], countries[rnd.Intn(len(countries))], paths[rnd.Intn(len(paths))], false)
			}
		}
	}
	// A visit that began yesterday evening and is still going, and some today.
	o.visit(time.Date(2026, 9, 21, 23, 50, 0, 0, time.UTC), 900, "Search", "DE", "/pricing", false)
	o.visit(time.Date(2026, 9, 22, 0, 1, 0, 0, time.UTC), 901, "AI", "US", "/docs", false)
	o.applied()
	// Sales, some from people who were there, some not.
	for i := 0; i < 6; i++ {
		o.sale("ord_"+strconv.Itoa(i), time.Date(2026, 9, 22-3-rnd.Intn(40), rnd.Intn(24), 0, 0, 0, time.UTC), 1+rnd.Uint64()%40, int64(1000+rnd.Intn(9000)))
	}
	o.sale("ord_straddle", time.Date(2026, 9, 21, 23, 55, 0, 0, time.UTC), 900, 4900)

	qs := append(o.reports(26, 5),
		// Aimed at what the steps below change: the day that straddles midnight, the
		// days around a late visit and around the sale it earns, a repeated event's day.
		"from=2026-09-21&to=2026-09-21&tz=UTC&daily=1&compare=previous",
		"from=2026-09-21&to=2026-09-21&tz=UTC&f=page:/docs",
		"from=2026-09-09&to=2026-09-12&tz=UTC&compare=previous",
		"from=2026-09-06&to=2026-09-08&tz=UTC&f=channel:AI",
		"from=2026-09-08&to=2026-09-08&tz=UTC&daily=1",
		"from=2026-08-30&to=2026-08-30&tz=UTC",
	)
	if held := o.warm(qs); held < len(qs)/2 {
		t.Fatalf("the cache holds %d of %d reports: the test would prove nothing", held, len(qs))
	}
	o.same(qs, "nothing (the cache against itself)")

	steps := []struct {
		name string
		do   func()
	}{
		{"a visit today", func() { o.visit(o.now(), 77, "Search", "DE", "/", false); o.applied() }},
		{"a late visit two weeks ago", func() {
			o.visit(time.Date(2026, 9, 8, 13, 0, 0, 0, time.UTC), 78, "Social", "NZ", "/pricing", true)
			o.applied()
		}},
		{"a sale by someone the site has not seen", func() { o.sale("ord_late", time.Date(2026, 9, 10, 15, 0, 0, 0, time.UTC), 79, 7700) }},
		{"a late visit, days before the sale it is credited with", func() {
			o.visit(time.Date(2026, 9, 7, 14, 0, 0, 0, time.UTC), 79, "AI", "DE", "/pricing", false)
			o.applied()
		}},
		{"the rest of a visit that began yesterday, after midnight", func() {
			o.visit(time.Date(2026, 9, 22, 0, 4, 0, 0, time.UTC), 900, "Search", "DE", "/docs", true)
			o.applied()
		}},
		{"a visit that started before its first retry", func() {
			o.visit(time.Date(2026, 9, 21, 23, 40, 0, 0, time.UTC), 901, "AI", "US", "/docs", false) // earlier in the same visit
			o.applied()
		}},
		{"a repeat of an event already stored", func() {
			o.g.event(o.t, event.Event{Kind: event.KindPageview, EventID: 5, TS: time.Date(2026, 8, 30, 10, 0, 0, 0, time.UTC).UnixMilli(), Visitor: 1234, Path: "/", Channel: "Search"})
			o.g.event(o.t, event.Event{Kind: event.KindPageview, EventID: 5, TS: time.Date(2026, 8, 30, 10, 0, 0, 0, time.UTC).UnixMilli(), Visitor: 1234, Path: "/", Channel: "Search"})
			o.g.waitApplied(o.t, o.nextID+2)
			o.nextID += 2
		}},
		{"a refund of an old sale", func() {
			o.webhook(fmt.Sprintf(`{"id":"evt_ref","type":"refund","at":%d,"refund":{"id":"ref_1","payment_id":"ord_late","amount":2000,"currency":"usd"}}`, o.now().Unix()))
		}},
		{"a new sale for a past day", func() { o.sale("ord_new", time.Date(2026, 9, 5, 9, 0, 0, 0, time.UTC), 5, 3300) }},
		{"a change of the site's zone", func() {
			if code, out := do(o.t, o.c, "PATCH", o.base, `{"timezone":"Asia/Tokyo"}`, csrf, "1"); code != http.StatusOK {
				o.t.Fatalf("zone: %d %v", code, out)
			}
		}},
		{"a change of the site's currency", func() {
			if code, out := do(o.t, o.c, "PATCH", o.base, `{"currency":"EUR"}`, csrf, "1"); code != http.StatusOK {
				o.t.Fatalf("currency: %d %v", code, out)
			}
		}},
		{"the revenue module off, then on", func() {
			do(o.t, o.c, "PUT", o.base+"/modules/revenue", `{"enabled":false}`, csrf, "1")
			o.same(qs[:8], "the revenue module turned off")
			do(o.t, o.c, "PUT", o.base+"/modules/revenue", `{"enabled":true}`, csrf, "1")
		}},
		{"new exchange rates", func() { o.g.api.PurgeAll() }},
		{"midnight passing", func() {
			o.g.clock.Store(time.Date(2026, 9, 23, 0, 5, 0, 0, time.UTC).UnixMilli())
			o.visit(o.now(), 80, "Direct", "DE", "/", false)
			o.applied()
		}},
	}
	for _, s := range steps {
		s.do()
		// A live report may be a few seconds behind its site's commits (liveFloor):
		// let that pass, so what is compared is what the cache holds for good.
		o.g.clock.Add((liveFloor + time.Second).Milliseconds())
		o.same(qs, s.name)
		// Ask them all again, so the cache is full for the next change, and a few new ones.
		o.warm(qs)
		o.warm(o.reports(6, int64(len(s.name))))
	}
}

// What the cache keeps must be most of it: traffic arriving today leaves
// every report that ended before today where it was, and a late visit drops
// only the reports it can reach.
func TestReportCacheKeepsWhatAChangeCannotReach(t *testing.T) {
	o := newGolden(t)
	o.visit(time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC), 1, "Search", "DE", "/", false)
	o.visit(time.Date(2026, 9, 10, 10, 0, 0, 0, time.UTC), 2, "Search", "DE", "/", false)
	o.applied()
	old := "from=2026-09-01&to=2026-09-05&tz=UTC"    // long over, and before the late visit
	recent := "from=2026-09-08&to=2026-09-12&tz=UTC" // long over, and around it
	yesterday := "from=2026-09-21&to=2026-09-21&tz=UTC"
	month := "from=2026-08-24&to=2026-09-22&tz=UTC" // includes today: short-lived
	for _, q := range []string{old, recent, yesterday, month} {
		o.get(q)
	}
	held := func() map[string]bool {
		o.g.api.cache.mu.Lock()
		defer o.g.api.cache.mu.Unlock()
		m := map[string]bool{}
		for _, e := range o.g.api.cache.m {
			m[time.UnixMilli(e.from).UTC().Format("2006-01-02")+" "+strconv.FormatBool(e.live)] = true
		}
		return m
	}
	if h := held(); !h["2026-09-01 false"] || !h["2026-09-08 false"] || !h["2026-09-21 false"] || !h["2026-08-24 true"] {
		t.Fatalf("what the cache holds: %v (ranges that ended before today are closed, the month is live)", h)
	}

	// Today's traffic: closed reports stay.
	o.visit(o.now(), 3, "Search", "DE", "/", false)
	o.applied()
	if h := held(); !h["2026-09-01 false"] || !h["2026-09-08 false"] || !h["2026-09-21 false"] {
		t.Fatalf("a visit today dropped a closed report: %v", h)
	}

	// A late visit on Sep 10: the reports around it go, the ones before it stay.
	o.visit(time.Date(2026, 9, 10, 11, 0, 0, 0, time.UTC), 4, "Social", "US", "/docs", false)
	o.applied()
	h := held()
	if !h["2026-09-01 false"] {
		t.Errorf("a late visit on the 10th dropped the report for the 1st to the 5th: %v", h)
	}
	if h["2026-09-08 false"] {
		t.Errorf("a late visit on the 10th left the report for the 8th to the 12th: %v", h)
	}
}
