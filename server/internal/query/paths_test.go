package query

import (
	"context"
	"testing"

	"github.com/trckable/trckable/server/internal/event"
)

// pathsQ writes each visit's pages in order, one visitor per visit; a page
// that starts with "!" is a goal of that name instead.
func pathsQ(t *testing.T, visits [][]string, country []string) Q {
	t.Helper()
	var flat []struct {
		visit int
		page  string
	}
	for i, v := range visits {
		for _, pg := range v {
			flat = append(flat, struct {
				visit int
				page  string
			}{i, pg})
		}
	}
	return visitsQ(t, len(flat), func(i int, e *event.Event) {
		e.Visitor = uint64(flat[i].visit) + 1 //nolint:gosec // test counter
		e.Country = country[flat[i].visit]
		if g, ok := cutBang(flat[i].page); ok {
			e.Kind, e.Goal, e.Pageview = event.KindGoal, g, 0
			return
		}
		e.Path = flat[i].page
	})
}

func cutBang(s string) (string, bool) {
	if len(s) > 1 && s[0] == '!' {
		return s[1:], true
	}
	return s, false
}

func routeOf(rs []PathRoute, steps ...string) *PathRoute {
	for i := range rs {
		if len(rs[i].Steps) != len(steps) {
			continue
		}
		same := true
		for j := range steps {
			same = same && rs[i].Steps[j] == steps[j]
		}
		if same {
			return &rs[i]
		}
	}
	return nil
}

func TestPathsGroupVisitsByTheirFirstThreePages(t *testing.T) {
	q := pathsQ(t, [][]string{
		{"/", "/pricing", "/signup", "/extra"},
		{"/", "/pricing", "/signup", "!signup"},
		{"/", "/pricing"},
		{"/blog"},
		{"/blog", "/"},
	}, []string{"US", "US", "DE", "DE", "US"})
	res, err := q.Paths(context.Background(), sep10)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "visits", res.Visits, int64(5))
	if r := routeOf(res.Routes, "/", "/pricing", "/signup"); r == nil || r.Visits != 2 || r.Converted != 1 {
		t.Fatalf("a fourth page is not part of the route, and one of two reached the goal, got %+v", res.Routes)
	}
	if r := routeOf(res.Routes, "/", "/pricing"); r == nil || r.Visits != 1 {
		t.Fatalf("a visit that ended on its second page is its own route, got %+v", res.Routes)
	}
	if r := routeOf(res.Routes, "/blog"); r == nil || r.Visits != 1 {
		t.Fatalf("a one-page visit is a route of one, got %+v", res.Routes)
	}
	eq(t, "busiest first", res.Routes[0].Visits, int64(2))
	if res.First == nil || res.First.Path != "/" || res.First.Visits != 3 {
		t.Fatalf("top first page, got %+v", res.First)
	}
	if res.Last == nil || res.Last.Visits < 1 {
		t.Fatalf("top last page, got %+v", res.Last)
	}
	if res.Pages <= 1 {
		t.Fatalf("pages per visit, got %v", res.Pages)
	}
}

func TestPathsFollowTheFilterAndTheLimit(t *testing.T) {
	q := pathsQ(t, [][]string{{"/", "/a"}, {"/", "/b"}, {"/", "/b"}}, []string{"US", "DE", "DE"})
	p := sep10
	p.Filters = []Filter{{Dim: "country", Value: "DE"}}
	res, err := q.Paths(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "visits", res.Visits, int64(2))
	eq(t, "routes", len(res.Routes), 1)
	if routeOf(res.Routes, "/", "/a") != nil {
		t.Fatalf("the American visit is filtered out, got %+v", res.Routes)
	}
	p = sep10
	p.Limit = 1
	res, err = q.Paths(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "limited", len(res.Routes), 1)
	if res.Routes[0].Steps[1] != "/b" {
		t.Fatalf("the busiest route stays, got %+v", res.Routes)
	}
}

func TestPathsOfAQuietSiteAreEmptyNotNull(t *testing.T) {
	q := pathsQ(t, [][]string{{"/"}}, []string{"US"})
	p := sep10
	p.From, p.To = p.From.AddDate(0, 0, -30), p.To.AddDate(0, 0, -30)
	res, err := q.Paths(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	if res.Visits != 0 || res.Routes == nil || len(res.Routes) != 0 || res.First != nil {
		t.Fatalf("nothing in the period, got %+v", res)
	}
}
