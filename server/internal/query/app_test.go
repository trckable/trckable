package query

import (
	"context"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// Phones and tablets are split by how the site was opened; a desktop never is.
// Visitors: 1 Mobile browser, 2 Mobile Instagram, 3 Mobile app, 4 Tablet app,
// 5 Desktop, 6 Mobile from before the column existed (a browser).
func appRig(t *testing.T, open bool) Q {
	at := func(h int) int64 { return time.Date(2026, 9, 10, h, 0, 0, 0, time.UTC).UnixMilli() }
	pv := func(h int, v uint64, device, app string) event.Event {
		return event.Event{Site: "s1", Kind: event.KindPageview, TS: at(h), Visitor: v, Path: "/", Device: device, App: app,
			EventID: v, Pageview: v}
	}
	evs := []event.Event{
		pv(9, 1, "Mobile", ""), pv(10, 2, "Mobile", "instagram"), pv(11, 3, "Mobile", "app"),
		pv(12, 4, "Tablet", "app"), pv(13, 5, "Desktop", ""), pv(14, 6, "Mobile", ""),
	}
	return rigOf(t, open, evs, at(14)+60_000, at(23))
}

func TestDeviceBreakdownSplitsPhonesByApp(t *testing.T) {
	for _, open := range []bool{false, true} {
		p := sep10
		p.Deep = true
		r, err := appRig(t, open).Report(context.Background(), p)
		if err != nil {
			t.Fatal(err)
		}
		got := rowsOf(r.Dims["device_app"])
		want := map[string]int64{"Mobile|browser": 2, "Mobile|instagram": 1, "Mobile|app": 1, "Tablet|app": 1}
		for k, n := range want {
			eq(t, "device_app "+k, got[k], n)
		}
		eq(t, "device_app rows", len(got), len(want)) // the desktop is not one
		eq(t, "Mobile", rowsOf(r.Dims["device"])["Mobile"], int64(4))
	}
}

func TestAppFilter(t *testing.T) {
	for _, open := range []bool{false, true} {
		q := appRig(t, open)
		for _, c := range []struct {
			f    Filter
			want int64
		}{
			{Filter{Dim: "app", Value: "app"}, 2},
			{Filter{Dim: "app", Value: "instagram"}, 1},
			{Filter{Dim: "app", Value: "browser"}, 2},
			{Filter{Dim: "app", Op: OpNot, Value: "browser"}, 4}, // the desktop is not a phone in the browser
		} {
			p := sep10
			p.Filters = []Filter{c.f}
			r, err := q.Report(context.Background(), p)
			if err != nil {
				t.Fatal(err)
			}
			eq(t, c.f.Dim+" "+c.f.Op+" "+c.f.Value, r.KPIs.Visitors, c.want)
		}
	}
}
