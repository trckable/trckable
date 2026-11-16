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

// Every page row of a report carries the title the site's script last sent for
// its path, in the pages list and in the entry and exit lists; a path with no
// title has none, and another site's title is never borrowed.
func TestReportRowsCarryPageTitles(t *testing.T) {
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

	at := func(h, m int) int64 { return time.Date(2026, 9, 10, h, m, 0, 0, time.UTC).UnixMilli() }
	view := func(site string, ts int64, v uint64, path, title string) event.Event {
		return event.Event{Site: site, Kind: event.KindPageview, TS: ts, Visitor: v, Path: path, Title: title}
	}
	evs := []event.Event{
		view("s1", at(9, 0), 1, "/pricing", "Pricing | Acme"),
		view("s1", at(9, 1), 1, "/docs", ""),
		view("s1", at(10, 0), 2, "/pricing", "Pricing | Acme"),
		view("s2", at(10, 0), 3, "/docs", "Another site's docs"),
	}
	for i := range evs {
		evs[i].EventID = uint64(i + 1)
		evs[i].Pageview = uint64(i + 1)
		b, _ := evs[i].Marshal()
		if _, err := lg.Append(ctx, b); err != nil {
			t.Fatal(err)
		}
	}
	clock := time.UnixMilli(at(23, 0))
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

	p := sep10
	p.Deep = true
	r, err := Q{DB: st.DB, Open: w.OpenSessions}.Report(ctx, p)
	if err != nil {
		t.Fatal(err)
	}
	titles := func(dim string) map[string]string {
		out := map[string]string{}
		for _, row := range r.Dims[dim] {
			out[row.Value] = row.Title
		}
		return out
	}
	for _, dim := range []string{"page", "entry_page"} {
		got := titles(dim)
		eq(t, dim+" /pricing", got["/pricing"], "Pricing | Acme")
	}
	eq(t, "page /docs has no title of this site's", titles("page")["/docs"], "")
	eq(t, "exit /docs", titles("exit_page")["/docs"], "")
	eq(t, "exit /pricing", titles("exit_page")["/pricing"], "Pricing | Acme")
}
