package query

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/store/duck"
	"github.com/trckable/trckable/server/internal/wal"
	"github.com/trckable/trckable/server/internal/writer"
)

// refQ runs one visit per referrer through the real writer, each from its own
// visitor, and returns a query handle over the result.
func refQ(t *testing.T, refs ...string) Q {
	t.Helper()
	return visitsQ(t, len(refs), func(i int, e *event.Event) { e.RefHost = refs[i] })
}

// visitsQ is refQ for any visit: fill adjusts visit i (from 0) before it is written.
func visitsQ(t *testing.T, n int, fill func(i int, e *event.Event)) Q {
	t.Helper()
	ctx := context.Background()
	dir := t.TempDir()
	st, err := duck.Open(ctx, filepath.Join(dir, "r.duckdb"), duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	lg, err := wal.Open(filepath.Join(dir, "wal"), wal.Options{NoSync: true})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { lg.Close() })
	base := time.Date(2026, 9, 10, 10, 0, 0, 0, time.UTC).UnixMilli()
	for i := 0; i < n; i++ {
		id := uint64(i) + 1 //nolint:gosec // test counter
		e := event.Event{Site: "s1", Kind: event.KindPageview, TS: base + int64(i)*1000, Visitor: id, Pageview: id,
			EventID: id, Path: "/", Channel: "Referral", Country: "US", Device: "Desktop", FirstSeen: base}
		fill(i, &e)
		b, _ := e.Marshal()
		if _, err := lg.Append(ctx, b); err != nil {
			t.Fatal(err)
		}
	}
	clock := time.UnixMilli(base + 6*3600_000)
	w := writer.New(lg, st, writer.Options{FlushEvery: 10 * time.Millisecond, IdleClose: 30 * time.Millisecond, Now: func() time.Time { return clock }})
	wctx, cancel := context.WithCancel(ctx)
	done := make(chan error, 1)
	go func() { done <- w.Run(wctx) }()
	for w.Applied() < uint64(n) { //nolint:gosec // test counter
		time.Sleep(5 * time.Millisecond)
	}
	time.Sleep(100 * time.Millisecond)
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	return Q{DB: st.DB, Open: w.OpenSessions}
}

// refRows returns the report's referrer rows for one visit per referrer.
func refRows(t *testing.T, refs ...string) map[string]int64 {
	t.Helper()
	r, err := refQ(t, refs...).Report(context.Background(), sep10)
	if err != nil {
		t.Fatal(err)
	}
	return rowsOf(r.Dims["referrer"])
}

func TestRefTagAndItsSiteAreOneSource(t *testing.T) {
	cases := []struct {
		name string
		refs []string
		want map[string]int64
	}{
		{"both", []string{"trustmrr", "trustmrr.com", "trustmrr.com"}, map[string]int64{"trustmrr.com": 3}},
		{"tag only", []string{"trustmrr", "trustmrr"}, map[string]int64{"trustmrr": 2}},
		{"host only", []string{"trustmrr.com"}, map[string]int64{"trustmrr.com": 1}},
		{"case", []string{"TrustMRR", "trustmrr.com"}, map[string]int64{"trustmrr.com": 2}},
		{"no match", []string{"friend", "trustmrr.com"}, map[string]int64{"friend": 1, "trustmrr.com": 1}},
		{"social unchanged", []string{"producthunt.com", "producthunt.com", "twitter.com"}, map[string]int64{"producthunt.com": 2, "twitter.com": 1}},
		{"subdomain is not a guess", []string{"news", "news.ycombinator.com"}, map[string]int64{"news": 1, "news.ycombinator.com": 1}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := refRows(t, c.refs...)
			if len(got) != len(c.want) {
				t.Fatalf("rows = %v, want %v", got, c.want)
			}
			for k, v := range c.want {
				if got[k] != v {
					t.Errorf("rows = %v, want %v", got, c.want)
				}
			}
		})
	}
}

// A new-referrer insight and a spike's top referrer count a tag and its site
// as one source too.
func TestRefTagMergesInInsightsAndMoments(t *testing.T) {
	ctx := context.Background()
	q := refQ(t, "trustmrr", "trustmrr", "trustmrr.com", "trustmrr.com", "other.com", "other.com", "other.com")
	p := sep10
	p.NewReferrers = 10
	res, err := q.Report(ctx, p)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]int64{}
	for _, n := range res.NewReferrers {
		got[n.Referrer] = n.Visitors
	}
	if len(got) != 2 || got["trustmrr.com"] != 4 || got["other.com"] != 3 {
		t.Errorf("new referrers = %v", got)
	}
	top, err := q.TopReferrer(ctx, "s1", sep10.From, sep10.To)
	if err != nil || top != "trustmrr.com" {
		t.Errorf("top referrer = %q, %v", top, err)
	}
}
