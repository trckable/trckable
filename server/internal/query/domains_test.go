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

// hostRig writes one visitor per entry of hosts[i] (a visitor may read on
// several domains) and reads them back, with sessions written or still open.
func hostRig(t *testing.T, open bool, hosts [][]string) Q {
	t.Helper()
	ctx := context.Background()
	dir := t.TempDir()
	st, err := duck.Open(ctx, filepath.Join(dir, "d.duckdb"), duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	lg, err := wal.Open(filepath.Join(dir, "wal"), wal.Options{NoSync: true})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { lg.Close() })

	var evs []event.Event
	for v, hs := range hosts {
		for i, h := range hs {
			evs = append(evs, event.Event{Site: "s1", Kind: event.KindPageview, Visitor: uint64(v + 1), Path: "/", Hostname: h,
				TS: time.Date(2026, 9, 10, 9+v, i, 0, 0, time.UTC).UnixMilli()})
		}
	}
	for i := range evs {
		evs[i].EventID = uint64(i + 1)
		evs[i].Pageview = uint64(i + 1)
		b, _ := evs[i].Marshal()
		if _, err := lg.Append(ctx, b); err != nil {
			t.Fatal(err)
		}
	}
	clock := time.Date(2026, 9, 10, 23, 0, 0, 0, time.UTC)
	if open {
		clock = time.Date(2026, 9, 10, 9+len(hosts), 1, 0, 0, time.UTC)
	}
	w := writer.New(lg, st, writer.Options{FlushEvery: 10 * time.Millisecond, IdleClose: 30 * time.Millisecond, Now: func() time.Time { return clock }})
	wctx, cancel := context.WithCancel(ctx)
	done := make(chan error, 1)
	go func() { done <- w.Run(wctx) }()
	for w.Applied() < uint64(len(evs)) {
		time.Sleep(5 * time.Millisecond)
	}
	time.Sleep(100 * time.Millisecond)
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	return Q{DB: st.DB, Open: w.OpenSessions}
}

func TestDomainsListAndFilter(t *testing.T) {
	for _, open := range []bool{false, true} {
		q := hostRig(t, open, [][]string{
			{"example.com"}, {"example.com"}, {"docs.example.com"},
			{"example.com", "docs.example.com"}, // one visit across both
		})
		r, err := q.Report(context.Background(), sep10)
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "hosts", r.Hosts, 2)
		rows := rowsOf(r.Dims["hostname"])
		eq(t, "example.com", rows["example.com"], int64(3))
		eq(t, "docs.example.com", rows["docs.example.com"], int64(2))

		for _, c := range []struct {
			op   string
			vals []string
			want int64
		}{
			{OpIs, []string{"docs.example.com"}, 2},
			{OpIs, []string{"docs.example.com", "example.com"}, 4},
			{OpNot, []string{"docs.example.com"}, 2},
		} {
			p := sep10
			for _, v := range c.vals {
				p.Filters = append(p.Filters, Filter{Dim: "hostname", Op: c.op, Value: v})
			}
			r, err := q.Report(context.Background(), p)
			if err != nil {
				t.Fatal(err)
			}
			eq(t, "visitors", r.KPIs.Visitors, c.want)
			eq(t, "hosts under a domain filter", r.Hosts, 2)
		}
	}
}

func TestOneDomainShowsNoList(t *testing.T) {
	q := hostRig(t, false, [][]string{{"example.com"}, {"example.com"}})
	r, err := q.Report(context.Background(), sep10)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "hosts", r.Hosts, 0)
	if _, ok := r.Dims["hostname"]; ok {
		t.Error("a one-domain site carries a domain list")
	}
	if !ValidDim("hostname") {
		t.Error("hostname is not a filter dimension")
	}
}
