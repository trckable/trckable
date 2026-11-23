package summary

import (
	"testing"

	"github.com/trckable/trckable/server/internal/query"
)

func fixture() (cur, prev *query.Result) {
	var channels, pages []query.Row
	for _, n := range []string{"a", "b", "c", "d", "e", "f", "g"} {
		channels = append(channels, query.Row{Value: n, Visitors: 10})
		pages = append(pages, query.Row{Value: "/" + n, Visitors: 5})
	}
	channels[1] = query.Row{Value: "AI", Visitors: 40}
	cur = &query.Result{
		KPIs:  query.KPIs{Visitors: 12345, Pageviews: 20000, BounceRate: 0.4, AvgSessionS: 61},
		Dims:  map[string][]query.Row{"channel": channels, "entry_page": pages},
		Goals: []query.Row{{Value: "signup", Label: "Signed up", Visitors: 9}},
		Money: &query.Money{Currency: "USD", Exponent: 2, Revenue: 50000, Payments: 4},
	}
	prev = &query.Result{KPIs: query.KPIs{Visitors: 10000, Pageviews: 20000}, Money: &query.Money{Revenue: 40000}}
	return cur, prev
}

func TestBuildReadsOneSummary(t *testing.T) {
	s := Build(fixture())
	if s.People.Now != 12345 || s.People.Prev != 10000 || s.People.Move.Dir != 1 || For("en").Say(s.People.Move) != "up 23%" {
		t.Errorf("people %+v", s.People)
	}
	if s.Pageviews.Move.Dir != 0 {
		t.Errorf("pageviews are flat: %+v", s.Pageviews)
	}
	if len(s.Sources) != TopN || len(s.Pages) != TopN {
		t.Errorf("one top-N rule: %d sources, %d pages", len(s.Sources), len(s.Pages))
	}
	if s.AI.People != 40 {
		t.Errorf("ai %+v", s.AI)
	}
	if len(s.Goals) != 1 || s.Goals[0].Name != "Signed up" {
		t.Errorf("goals %+v", s.Goals)
	}
	if m := s.Money; m == nil || m.Revenue.Now != 50000 || !m.HasPrev || m.Revenue.Move.Dir != 1 {
		t.Errorf("money %+v", m)
	}
}

func TestBuildWithoutBeforeOrMoney(t *testing.T) {
	cur, _ := fixture()
	cur.Money = nil
	s := Build(cur, nil)
	if !s.People.Move.Fresh || s.Money != nil {
		t.Errorf("nothing before: %+v", s)
	}
	cur.Money = &query.Money{Currency: "USD", Exponent: 2}
	if Build(cur, nil).Money != nil {
		t.Error("no payments, no money line")
	}
}
