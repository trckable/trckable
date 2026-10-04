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

// A report over visits that name a browser version and a window width, run
// with every session written and with the last one still open in memory:
// both must read the same two columns.
func dimsRig(t *testing.T, open bool) Q {
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

	at := func(h, m int) int64 { return time.Date(2026, 9, 10, h, m, 0, 0, time.UTC).UnixMilli() }
	pv := func(ts int64, v uint64, ver string, width uint16) event.Event {
		return event.Event{Site: "s1", Kind: event.KindPageview, TS: ts, Visitor: v, Pageview: v*10 + uint64(ts%7), Path: "/",
			Browser: "Chrome", BrowserVersion: ver, Screen: width}
	}
	evs := []event.Event{
		pv(at(9, 0), 1, "Chrome 129", 390),
		pv(at(9, 1), 1, "Chrome 129", 1440), // the entry pageview decides the screen
		pv(at(10, 0), 2, "Chrome 130", 1280),
		pv(at(11, 0), 3, "Safari 18", 1920),
		pv(at(12, 0), 4, "", 0), // recorded before either was kept
		pv(at(13, 0), 5, "Chrome 130", 2560),
		pv(at(14, 0), 6, "Chrome 130", 640),  // the top of the first bucket
		pv(at(15, 0), 7, "Chrome 130", 641),  // the bottom of the second
		pv(at(16, 0), 8, "Chrome 130", 1024), // the top of the second
	}
	for i := range evs {
		evs[i].EventID = uint64(i + 1)
		b, _ := evs[i].Marshal()
		if _, err := lg.Append(ctx, b); err != nil {
			t.Fatal(err)
		}
	}
	clock := time.UnixMilli(at(16, 1))
	if !open {
		clock = time.UnixMilli(at(23, 0))
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

func TestBrowserVersionAndScreenDimensions(t *testing.T) {
	for _, open := range []bool{false, true} {
		q := dimsRig(t, open)
		p := sep10
		p.Deep = true
		r, err := q.Report(context.Background(), p)
		if err != nil {
			t.Fatal(err)
		}
		ver := rowsOf(r.Dims["browser_version"])
		eq(t, "Chrome 129", ver["Chrome 129"], int64(1))
		eq(t, "Chrome 130", ver["Chrome 130"], int64(5))
		eq(t, "Safari 18", ver["Safari 18"], int64(1))
		eq(t, "a visit before versions were kept", ver["Unknown"], int64(1))

		scr := rowsOf(r.Dims["screen"])
		want := map[string]int64{"≤640": 2, "641–1024": 2, "1025–1440": 1, "1441–1920": 1, ">1920": 1}
		for label, n := range want {
			eq(t, "screen "+label, scr[label], n)
		}
		eq(t, "screen rows", len(scr), len(want)) // the visit that never said is not a row

		// Core does not ask for either.
		p.Deep = false
		r, err = q.Report(context.Background(), p)
		if err != nil {
			t.Fatal(err)
		}
		if _, ok := r.Dims["screen"]; ok {
			t.Error("Core's report carries screen buckets")
		}
	}
}

func TestBrowserVersionAndScreenFilter(t *testing.T) {
	for _, open := range []bool{false, true} {
		q := dimsRig(t, open)
		p := sep10
		p.Deep = true
		for _, c := range []struct {
			dim, value string
			visitors   int64
		}{
			{"screen", "≤640", 2},
			{"screen", "1025–1440", 1},
			{"screen", ">1920", 1},
			{"browser_version", "Chrome 130", 5},
			{"browser_version", "Unknown", 1},
		} {
			p.Filters = []Filter{{Dim: c.dim, Value: c.value}}
			r, err := q.Report(context.Background(), p)
			if err != nil {
				t.Fatal(err)
			}
			eq(t, c.dim+" = "+c.value, r.KPIs.Visitors, c.visitors)
		}
	}
}
