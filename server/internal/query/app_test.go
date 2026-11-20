package query

import (
	"context"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// Visits are split by how the site was opened: a phone's or tablet's system with
// browser or app, a social app, a desktop (an app only when it said so).
// Visitors: 1 iOS browser, 2 Instagram, 3 iOS app, 4 Android tablet app,
// 5 Desktop, 6 Android browser from before the column existed, 7 Desktop app.
func appRig(t *testing.T, open bool) Q {
	at := func(h int) int64 { return time.Date(2026, 9, 10, h, 0, 0, 0, time.UTC).UnixMilli() }
	pv := func(h int, v uint64, device, os, app string) event.Event {
		return event.Event{Site: "s1", Kind: event.KindPageview, TS: at(h), Visitor: v, Path: "/", Device: device, OS: os, App: app,
			EventID: v, Pageview: v}
	}
	evs := []event.Event{
		pv(9, 1, "Mobile", "iOS", ""), pv(10, 2, "Mobile", "iOS", "instagram"), pv(11, 3, "Mobile", "iOS", "app"),
		pv(12, 4, "Tablet", "Android", "app"), pv(13, 5, "Desktop", "macOS", ""), pv(14, 6, "Mobile", "Android", ""),
		pv(15, 7, "Desktop", "macOS", "app"),
	}
	return rigOf(t, open, evs, at(15)+60_000, at(23))
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
		want := map[string]int64{"iOS|browser": 1, "instagram": 1, "iOS|app": 1, "Android|app": 1, "Android|browser": 1, "Desktop": 1, "Desktop|app": 1}
		for k, n := range want {
			eq(t, "device_app "+k, got[k], n)
		}
		eq(t, "device_app rows", len(got), len(want))
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
			{Filter{Dim: "app", Value: "app"}, 3},
			{Filter{Dim: "app", Value: "instagram"}, 1},
			{Filter{Dim: "app", Value: "browser"}, 2},
			{Filter{Dim: "app", Op: OpNot, Value: "browser"}, 5}, // the desktop is not a phone in the browser
			{Filter{Dim: "device_app", Value: "iOS|app"}, 1},
			{Filter{Dim: "device_app", Value: "Desktop|app"}, 1},
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

// A visitor's journey says how each visit opened the site: nothing for a
// browser (or a row from before the column), "app", or the social app's key.
func TestJourneyCarriesApp(t *testing.T) {
	upTo := time.Date(2026, 9, 12, 0, 0, 0, 0, time.UTC)
	for _, open := range []bool{false, true} {
		q := appRig(t, open)
		for v, want := range map[uint64]string{1: "", 2: "instagram", 3: "app", 5: ""} {
			j, err := q.Journey(context.Background(), "s1", v, upTo)
			if err != nil || len(j.Visits) != 1 {
				t.Fatalf("visitor %d: %+v %v", v, j, err)
			}
			eq(t, "app of visitor "+string(rune('0'+v)), j.Visits[0].App, want)
		}
	}
}

// An app's visits narrow by device too: the phone's app, not the tablet's or the desktop's.
func TestAppFilterWithDevice(t *testing.T) {
	for _, open := range []bool{false, true} {
		for device, want := range map[string]int64{"Mobile": 1, "Tablet": 1, "Desktop": 1} {
			p := sep10
			p.Filters = []Filter{{Dim: "app", Value: "app"}, {Dim: "device", Value: device}}
			r, err := appRig(t, open).Report(context.Background(), p)
			if err != nil {
				t.Fatal(err)
			}
			eq(t, "app on "+device, r.KPIs.Visitors, want)
		}
	}
}
