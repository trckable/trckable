package query

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

// The golden site on Sep 10 (see report_test.go): A (DE, Desktop, Search, two
// sessions: Search then Direct), B (US, Mobile, AI), C (US, Desktop, Search).
func visitorsWith(t *testing.T, q Q, fs ...Filter) int64 {
	t.Helper()
	p := sep10
	p.Filters = fs
	r, err := q.Report(context.Background(), p)
	if err != nil {
		t.Fatalf("%v: %v", fs, err)
	}
	return r.KPIs.Visitors
}

func TestFilterIsNotAndAnyOf(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		is := func(d, v string) Filter { return Filter{Dim: d, Value: v} }
		not := func(d, v string) Filter { return Filter{Dim: d, Op: OpNot, Value: v} }
		cases := []struct {
			name string
			fs   []Filter
			want int64
		}{
			{"is", []Filter{is("country", "DE")}, 1},
			{"explicit is", []Filter{{Dim: "country", Op: OpIs, Value: "DE"}}, 1},
			{"not", []Filter{not("country", "US")}, 1},
			{"any of", []Filter{is("country", "DE"), is("country", "US")}, 3},
			{"any of with a value nobody has", []Filter{is("country", "DE"), is("country", "FR")}, 1},
			{"none of", []Filter{not("country", "DE"), not("country", "US")}, 0},
			{"mixed: any of countries AND not mobile", []Filter{is("country", "DE"), is("country", "US"), not("device", "Mobile")}, 2},
			{"mixed: is and not on one dimension", []Filter{is("country", "US"), not("country", "US")}, 0},
			{"channel not Search", []Filter{not("channel", "Search")}, 2}, // B (AI) and A's second session (Direct)
			{"a repeat is one value", []Filter{is("country", "DE"), is("country", "DE")}, 1},
			{"page any of", []Filter{is("page", "/blog"), is("page", "/pricing")}, 3},
			{"page not", []Filter{not("page", "/pricing")}, 2}, // B never read it; A's second visit (Direct, only "/") did not
			{"goal is", []Filter{is("goal", "signup")}, 1},
			{"goal not", []Filter{not("goal", "signup")}, 3}, // A too: its second visit sent none
			{"goal any of with one nobody sent", []Filter{is("goal", "signup"), is("goal", "other")}, 1},
		}
		for _, c := range cases {
			t.Run(c.name, func(t *testing.T) { eq(t, c.name, visitorsWith(t, q, c.fs...), c.want) })
		}
	})
}

// "is not" keeps the visits that have no value at all: a country that was
// never known is not US.
func TestNotKeepsUnknownValues(t *testing.T) {
	cte, args, err := sessionsCTE(Params{Site: "s1", From: sep10.From, To: sep10.To, Filters: []Filter{{Dim: "country", Op: OpNot, Value: "US"}}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(cte, "(country IS NULL OR country <> ?)") {
		t.Errorf("the NULL case is missing:\n%s", cte)
	}
	if got := args[len(args)-1]; got != "US" {
		t.Errorf("last arg = %v", got)
	}
}

func TestFilterSQLShape(t *testing.T) {
	where := func(fs ...Filter) (string, []any) {
		w, a, err := filterWhere(Params{Site: "s1", Filters: fs}, sep10.From, sep10.To)
		if err != nil {
			t.Fatal(err)
		}
		return w, a
	}
	w, a := where(Filter{Dim: "country", Value: "DE"}, Filter{Dim: "country", Value: "AT"}, Filter{Dim: "device", Op: OpNot, Value: "Mobile"}, Filter{Dim: "os", Op: OpNot, Value: "iOS"}, Filter{Dim: "os", Op: OpNot, Value: "Android"})
	want := " WHERE country IN (?, ?) AND (device IS NULL OR device <> ?) AND (os IS NULL OR os NOT IN (?, ?))"
	if w != want {
		t.Errorf("where = %q\nwant    %q", w, want)
	}
	if fmt.Sprint(a) != "[DE AT Mobile iOS Android]" {
		t.Errorf("args = %v", a)
	}
	w, a = where(Filter{Dim: "page", Op: OpNot, Value: "/a"}, Filter{Dim: "page", Op: OpNot, Value: "/b"})
	if !strings.Contains(w, "session_id NOT IN (SELECT session_id FROM events") || !strings.Contains(w, "path IN (?, ?) AND session_id IS NOT NULL") {
		t.Errorf("page not: %q", w)
	}
	if len(a) != 5 {
		t.Errorf("page not args = %v", a)
	}
}

func TestFilterValuesAreNeverSQL(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		for _, v := range []string{"US' OR '1'='1", "x'); DROP TABLE sessions; --", `"; DELETE FROM events`, "US%", "%", "?"} {
			for _, op := range []string{OpIs, OpNot} {
				for _, d := range []string{"country", "page", "goal", "channel"} {
					r, err := q.Report(context.Background(), Params{Site: "s1", From: sep10.From, To: sep10.To, Filters: []Filter{{Dim: d, Op: op, Value: v}}})
					if err != nil {
						t.Fatalf("%s %s %q: %v", d, op, v, err)
					}
					if op == OpIs {
						eq(t, d+" is "+v, r.KPIs.Visitors, int64(0))
					} else {
						eq(t, d+" is not "+v+" leaves everyone", r.KPIs.Visitors, int64(3))
					}
				}
			}
		}
		// The store is still there.
		eq(t, "everyone", visitorsWith(t, q), int64(3))
		for _, f := range []Filter{
			{Dim: "country", Op: "is; DROP TABLE sessions", Value: "x"},
			{Dim: "country", Op: "!=", Value: "x"},
			{Dim: "country) OR (1=1", Value: "x"},
			{Dim: "country", Op: "NOT", Value: "x"},
		} {
			if _, err := q.Report(context.Background(), Params{Site: "s1", From: sep10.From, To: sep10.To, Filters: []Filter{f}}); err == nil {
				t.Errorf("%+v was accepted", f)
			}
		}
	})
}

func TestFilterValueCap(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		var fs []Filter
		for i := 0; i < MaxFilterValues; i++ {
			fs = append(fs, Filter{Dim: "country", Value: fmt.Sprintf("X%d", i)})
		}
		eq(t, "twenty values", visitorsWith(t, q, fs...), int64(0))
		fs = append(fs, Filter{Dim: "country", Value: "DE"})
		p := sep10
		p.Filters = fs
		if _, err := q.Report(context.Background(), p); err == nil {
			t.Fatal("21 values on one dimension were accepted")
		}
		// The cap is per dimension: twenty countries and a device is fine.
		fs = append(fs[:MaxFilterValues], Filter{Dim: "device", Value: "Desktop"})
		eq(t, "twenty countries and a device", visitorsWith(t, q, fs...), int64(0))
		// Both ops count: 15 is and 6 is-not values for one dimension is 21.
		fs = nil
		for i := 0; i < 15; i++ {
			fs = append(fs, Filter{Dim: "country", Value: fmt.Sprintf("X%d", i)})
		}
		for i := 0; i < 6; i++ {
			fs = append(fs, Filter{Dim: "country", Op: OpNot, Value: fmt.Sprintf("Y%d", i)})
		}
		p.Filters = fs
		if _, err := q.Report(context.Background(), p); err == nil {
			t.Fatal("the cap did not count both ops")
		}
	})
}

// A filter only ever reads its own site, however it is worded.
func TestFilterStaysOnItsSite(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		p := sep10
		p.Site = "s2"
		p.Filters = []Filter{{Dim: "country", Op: OpNot, Value: "XX"}}
		r, err := q.Report(context.Background(), p)
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "another site's visitors", r.KPIs.Visitors, int64(0))
		p.Filters = []Filter{{Dim: "page", Op: OpNot, Value: "/nope"}}
		r, _ = q.Report(context.Background(), p)
		eq(t, "another site, event filter", r.KPIs.Visitors, int64(0))
	})
}

func TestPageGoalsAndCustomGoalsMix(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		p := sep10
		p.PageGoals = []Group{{Name: "Saw pricing", Path: "/pricing"}}
		p.Filters = []Filter{{Dim: "goal", Value: "Saw pricing"}, {Dim: "goal", Value: "signup"}}
		r, err := q.Report(context.Background(), p)
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "saw pricing or signed up", r.KPIs.Visitors, int64(2)) // A and C
		p.Filters = []Filter{{Dim: "goal", Op: OpNot, Value: "Saw pricing"}, {Dim: "goal", Op: OpNot, Value: "signup"}}
		r, _ = q.Report(context.Background(), p)
		eq(t, "neither", r.KPIs.Visitors, int64(2)) // B, and A's second visit
	})
}

func TestNotFollowsTheMoneyAndSessions(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		p := sep10
		p.Filters = []Filter{{Dim: "country", Op: OpNot, Value: "US"}}
		r, err := q.Report(context.Background(), p)
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "sessions", r.KPIs.Sessions, int64(2))
		eq(t, "pageviews (A: two, then one)", r.KPIs.Pageviews, int64(3))
		eq(t, "the page list follows", rowsOf(r.Dims["page"])["/blog"], int64(0))
		eq(t, "countries listed", len(rowsOf(r.Dims["country"])), 1)
	})
}

func TestSectionNot(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		p := sep10
		p.Groups = []Group{{Name: "Writing", Path: "/blog*"}, {Name: "Pricing", Path: "/pricing"}}
		p.Filters = []Filter{{Dim: "group", Op: OpNot, Value: "Writing"}}
		r, err := q.Report(context.Background(), p)
		if err != nil {
			t.Fatal(err)
		}
		eq(t, "everyone but the reader of the blog", r.KPIs.Visitors, int64(2))
		p.Filters = []Filter{{Dim: "group", Value: "Writing"}, {Dim: "group", Value: "Pricing"}}
		r, _ = q.Report(context.Background(), p)
		eq(t, "either section", r.KPIs.Visitors, int64(3))
	})
}
