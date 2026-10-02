package query

import (
	"context"
	"reflect"
	"testing"
	"time"
)

var sep9to11 = Params{Site: "s1", From: time.Date(2026, 9, 9, 0, 0, 0, 0, time.UTC), To: time.Date(2026, 9, 12, 0, 0, 0, 0, time.UTC), TZ: "UTC"}

func TestSparks(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		ctx := context.Background()
		got, err := q.Sparks(ctx, sep9to11, "referrer", []string{"google.com", "chatgpt.com", "nobody.example"})
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(got.Days, []string{"2026-09-09", "2026-09-10", "2026-09-11"}) {
			t.Fatalf("days %v", got.Days)
		}
		want := map[string][]int64{"google.com": {0, 2, 0}, "chatgpt.com": {0, 1, 0}, "nobody.example": {0, 0, 0}}
		if !reflect.DeepEqual(got.Rows, want) {
			t.Fatalf("referrers %v, want %v", got.Rows, want)
		}

		// A row is its visitors, not its sessions: visitor 1 came to "/" twice.
		got, err = q.Sparks(ctx, sep9to11, "entry_page", []string{"/", "/docs"})
		if err != nil {
			t.Fatal(err)
		}
		if want := map[string][]int64{"/": {0, 1, 0}, "/docs": {0, 0, 1}}; !reflect.DeepEqual(got.Rows, want) {
			t.Fatalf("entry pages %v, want %v", got.Rows, want)
		}

		// Channels use the report's own names (a missing one is Direct), and a filter narrows them.
		got, err = q.Sparks(ctx, sep9to11, "channel", []string{"Search", "Direct", "Email"})
		if err != nil {
			t.Fatal(err)
		}
		if want := map[string][]int64{"Search": {0, 2, 0}, "Direct": {0, 1, 0}, "Email": {0, 0, 1}}; !reflect.DeepEqual(got.Rows, want) {
			t.Fatalf("channels %v, want %v", got.Rows, want)
		}
		f := sep9to11
		f.Filters = []Filter{{Dim: "channel", Value: "Search"}}
		got, err = q.Sparks(ctx, f, "entry_page", []string{"/", "/pricing", "/blog"})
		if err != nil {
			t.Fatal(err)
		}
		if want := map[string][]int64{"/": {0, 1, 0}, "/pricing": {0, 1, 0}, "/blog": {0, 0, 0}}; !reflect.DeepEqual(got.Rows, want) {
			t.Fatalf("filtered %v, want %v", got.Rows, want)
		}
	})
}

// Only the fixed dimensions and a handful of rows: user input never becomes a
// column, and a request cannot be turned into a scan of a whole breakdown.
func TestSparksRefusals(t *testing.T) {
	q := golden(t, false)
	ctx := context.Background()
	if _, err := q.Sparks(ctx, sep9to11, "visitor_id; DROP TABLE sessions", []string{"x"}); err == nil {
		t.Fatal("an unknown dimension must be refused")
	}
	if _, err := q.Sparks(ctx, sep9to11, "page", []string{"/"}); err == nil {
		t.Fatal("events-based dimensions have no sparklines")
	}
	if _, err := q.Sparks(ctx, sep9to11, "referrer", nil); err == nil {
		t.Fatal("no rows is not a question")
	}
	many := make([]string, MaxSparkRows+1)
	for i := range many {
		many[i] = string(rune('a' + i))
	}
	if _, err := q.Sparks(ctx, sep9to11, "referrer", many); err == nil {
		t.Fatal("more rows than a list shows must be refused")
	}
	// Values are bound, never spliced into the SQL.
	if _, err := q.Sparks(ctx, sep9to11, "referrer", []string{"x') OR 1=1 --"}); err != nil {
		t.Fatal(err)
	}
}

func TestUsual(t *testing.T) {
	both(t, func(t *testing.T, q Q) {
		ctx := context.Background()
		day := func(d, h, m int) time.Time { return time.Date(2026, 9, d, h, m, 0, 0, time.UTC) }
		// Thursday 17th, the whole day: the 10th (3 visitors) is the only Thursday the site had begun.
		p := Params{Site: "s1", From: day(17, 0, 0), To: day(18, 0, 0), TZ: "UTC"}
		u, err := q.Usual(ctx, p, MaxUsualWeeks)
		if err != nil {
			t.Fatal(err)
		}
		if u.Visitors != 0 || u.Average != 3 || len(u.Weeks) != 1 || u.Weeks[0] != (UsualWk{Day: "2026-09-10", Visitors: 3}) {
			t.Fatalf("whole Thursday: %+v", u)
		}

		// So far today (until 11:30): the same stretch of the 10th has two visitors, not all three.
		p.To = day(17, 11, 30)
		if u, err = q.Usual(ctx, p, MaxUsualWeeks); err != nil || u.Average != 2 {
			t.Fatalf("until 11:30: %+v %v", u, err)
		}

		// A Friday before any Friday the site saw: nothing usual to say.
		p = Params{Site: "s1", From: day(11, 0, 0), To: day(12, 0, 0), TZ: "UTC"}
		if u, err = q.Usual(ctx, p, MaxUsualWeeks); err != nil || len(u.Weeks) != 0 || u.Average != 0 || u.Visitors != 1 {
			t.Fatalf("a first Friday: %+v %v", u, err)
		}
		if _, err = q.Usual(ctx, p, MaxUsualWeeks+1); err == nil {
			t.Fatal("looking back further than the limit must be refused")
		}
	})
}
