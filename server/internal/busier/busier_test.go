package busier

import (
	"reflect"
	"testing"
	"time"
)

func TestJudge(t *testing.T) {
	for _, c := range []struct {
		name     string
		online   int64
		usual    float64
		baseline bool
		want     State
	}{
		{"the albas.al jump", 50, 20, true, Busier},
		{"exactly at times and plus", 30, 20, true, Busier},
		{"one under", 29, 20, true, Normal},
		{"small site: plus rules, not times", 12, 4, true, Normal},
		{"small site over both", 14, 4, true, Busier},
		{"big site: times rules", 149, 100, true, Normal},
		{"big site over", 150, 100, true, Busier},
		{"no baseline", 500, 20, false, Normal},
		{"no usual at all", 500, 0, true, Normal},
		{"quieter", 10, 20, true, Quieter},
		{"quieter needs ten fewer", 12, 20, true, Normal},
		{"quiet but a small site", 0, 5, true, Normal},
		{"quiet big site", 60, 100, true, Quieter},
		{"as usual", 20, 20, true, Normal},
	} {
		if got := Judge(c.online, c.usual, c.baseline); got != c.want {
			t.Errorf("%s: Judge(%d, %v) = %q, want %q", c.name, c.online, c.usual, got, c.want)
		}
	}
}

func TestThreshold(t *testing.T) {
	for usual, want := range map[float64]float64{0: 10, 4: 14, 20: 30, 20.5: 30.75, 100: 150} {
		if got := Threshold(usual); got != want {
			t.Errorf("Threshold(%v) = %v, want %v", usual, got, want)
		}
	}
}

func TestHours(t *testing.T) {
	loc, _ := time.LoadLocation("Europe/Berlin")
	now := time.Date(2026, 10, 6, 15, 20, 0, 0, loc) // a Tuesday
	day := func(days int) time.Time { return now.AddDate(0, 0, -days) }
	at := func(days int) time.Time { // the hour start, n days ago
		return time.Date(2026, 10, 6, 15, 0, 0, 0, loc).AddDate(0, 0, -days)
	}
	for _, c := range []struct {
		name  string
		first time.Time
		basis Basis
		want  []time.Time
	}{
		{"no events", time.Time{}, None, nil},
		{"six days of data", day(6), None, nil},
		{"seven days: one same weekday, so the week", day(7), Week, []time.Time{at(1), at(2), at(3), at(4), at(5), at(6), at(7)}},
		{"fourteen days: two weekdays", day(14), Weekdays, []time.Time{at(7), at(14)}},
		{"a year", day(365), Weekdays, []time.Time{at(7), at(14), at(21), at(28)}},
	} {
		got, basis := Hours(now, c.first, loc)
		if basis != c.basis || !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: %v %q, want %v %q", c.name, got, basis, c.want, c.basis)
		}
	}
}

// The wall clock keeps its hour over a daylight-saving change.
func TestHoursKeepTheWallClockAcrossDST(t *testing.T) {
	loc, _ := time.LoadLocation("Europe/Berlin")
	now := time.Date(2026, 11, 3, 15, 0, 0, 0, loc) // a week after the clocks went back
	got, _ := Hours(now, now.AddDate(-1, 0, 0), loc)
	for _, h := range got {
		if h.Hour() != 15 || h.Weekday() != time.Tuesday {
			t.Errorf("hour %v is not a Tuesday 15:00", h)
		}
	}
}

func TestSpread(t *testing.T) {
	for _, c := range []struct {
		in           []float64
		u, low, high float64
	}{
		{nil, 0, 0, 0},
		{[]float64{7}, 7, 7, 7},
		{[]float64{30, 10, 20}, 20, 10, 30},
		{[]float64{10, 20, 30, 40}, 25, 10, 40},
	} {
		u, low, high := Spread(c.in)
		if u != c.u || low != c.low || high != c.high {
			t.Errorf("Spread(%v) = %v %v %v", c.in, u, low, high)
		}
	}
}

func TestContributorsAreTheTopThreeByExtraPeople(t *testing.T) {
	got := Contributors([]Group{
		{Dim: DimSource, Now: []Count{{"Facebook", 25}, {"Google", 14}, {"X", 3}}, Usual: map[string]float64{"Facebook": 3, "Google": 8, "X": 2}},
		{Dim: DimPage, Now: []Count{{"/products/summer", 22}, {"/", 20}}, Usual: map[string]float64{"/products/summer": 2, "/": 19}},
		{Dim: DimCountry, Now: []Count{{"US", 30}}, Usual: map[string]float64{"US": 12}},
		{Dim: DimCampaign, Now: []Count{{"summer", 5}}, Usual: nil},
	})
	want := []Contributor{
		{DimSource, "Facebook", 25, 3, 22},
		{DimPage, "/products/summer", 22, 2, 20},
		{DimCountry, "US", 30, 12, 18},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v\nwant %+v", got, want)
	}
}

func TestContributorsSkipSmallAndNegativeChanges(t *testing.T) {
	got := Contributors([]Group{{Dim: DimSource, Now: []Count{{"a.com", 5}, {"b.com", 1}, {"c.com", 0}}, Usual: map[string]float64{"a.com": 4, "b.com": 0, "c.com": 9}}})
	if len(got) != 0 {
		t.Fatalf("%+v", got)
	}
}

func TestContributorTiesGoBySourceFirst(t *testing.T) {
	got := Contributors([]Group{
		{Dim: DimCountry, Now: []Count{{"DE", 10}}},
		{Dim: DimSource, Now: []Count{{"z.com", 10}, {"a.com", 10}}},
	})
	if len(got) != 3 || got[0].Value != "a.com" || got[1].Value != "z.com" || got[2].Dim != DimCountry {
		t.Fatalf("%+v", got)
	}
}

func TestRestIsWhatTheSourcesDoNotExplain(t *testing.T) {
	g := []Group{{Dim: DimSource, Now: []Count{{"l.facebook.com", 25}, {"google.com", 14}, {"bing.com", 1}}, Usual: map[string]float64{"l.facebook.com": 3, "google.com": 8, "bing.com": 4}}}
	// 50 online, 20 usual: 30 extra, sources explain 22 + 6 = 28.
	if got := Rest(50, 20, g); got != 2 {
		t.Fatalf("rest %d", got)
	}
	if got := Rest(40, 20, g); got != 0 {
		t.Fatalf("never below none: %d", got)
	}
}

func TestOnlineSlidesAFiveMinuteWindow(t *testing.T) {
	v := func(ids ...uint64) map[uint64]struct{} {
		m := map[uint64]struct{}{}
		for _, id := range ids {
			m[id] = struct{}{}
		}
		return m
	}
	got := Online([]map[uint64]struct{}{v(1), v(1, 2), nil, nil, nil, nil, v(3)})
	if want := []int64{1, 2, 2, 2, 2, 2, 1}; !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestSince(t *testing.T) {
	for _, c := range []struct {
		name   string
		online []int64
		idx    int
		capped bool
		ok     bool
	}{
		{"empty", nil, 0, false, false},
		{"not busier now", []int64{5, 40, 40, 20}, 0, false, false},
		{"began three minutes ago", []int64{5, 6, 40, 41, 45}, 2, false, true},
		{"a dip ends the stretch", []int64{40, 41, 12, 33, 45}, 3, false, true},
		{"busier the whole look back", []int64{40, 41, 42}, 0, true, true},
		{"just now", []int64{5, 6, 7, 31}, 3, false, true},
	} {
		idx, capped, ok := Since(c.online, 30)
		if idx != c.idx || capped != c.capped || ok != c.ok {
			t.Errorf("%s: %d %v %v, want %d %v %v", c.name, idx, capped, ok, c.idx, c.capped, c.ok)
		}
	}
}

func TestTallyNamesSourcesAndSkipsEmptyValues(t *testing.T) {
	got := Tally([]Entry{
		{Host: "l.facebook.com", Channel: "Social", Page: "/p", Country: "US", N: 10},
		{Host: "m.facebook.com", Channel: "Social", Page: "/p", Country: "DE", N: 5},
		{Channel: "Direct", Page: "/", N: 7},
		{Channel: "Email", Page: "/", Campaign: "sep", N: 2},
	})
	if want := map[string]float64{"Facebook": 15, "Direct": 7, "Email": 2}; !reflect.DeepEqual(got[DimSource], want) {
		t.Errorf("sources %v", got[DimSource])
	}
	if want := map[string]float64{"/p": 15, "/": 9}; !reflect.DeepEqual(got[DimPage], want) {
		t.Errorf("pages %v", got[DimPage])
	}
	if want := map[string]float64{"US": 10, "DE": 5}; !reflect.DeepEqual(got[DimCountry], want) {
		t.Errorf("countries %v", got[DimCountry])
	}
	if want := map[string]float64{"sep": 2}; !reflect.DeepEqual(got[DimCampaign], want) {
		t.Errorf("campaigns %v", got[DimCampaign])
	}
}

// A source missing from most of the sampled hours has a usual of 0.
func TestUsualOfIsTheMedianWithMissingAsZero(t *testing.T) {
	h := func(fb, g float64) map[string]map[string]float64 {
		m := map[string]float64{"Google": g}
		if fb > 0 {
			m["Facebook"] = fb
		}
		return map[string]map[string]float64{DimSource: m}
	}
	got := UsualOf([]map[string]map[string]float64{h(9, 8), h(0, 10), h(0, 12), h(4, 9)})
	if got[DimSource]["Facebook"] != 2 || got[DimSource]["Google"] != 9.5 {
		t.Fatalf("%v", got)
	}
}

func TestBiggestOrdersAndCuts(t *testing.T) {
	got := Biggest(map[string]float64{"a": 3, "b": 9, "c": 3, "d": 1}, 3)
	if want := []Count{{"b", 9}, {"a", 3}, {"c", 3}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("%v", got)
	}
}
