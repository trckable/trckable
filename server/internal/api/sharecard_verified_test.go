package api

import (
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/cards"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/revenue"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func conn(provider, mode string, last int64) revenue.Connection {
	return revenue.Connection{Provider: provider, Mode: mode, LastEvent: &last, CreatedAt: last}
}

// A badge names the source that really delivers, and on money only when ALL of it is verified: a provider without a
// mark, typed-in revenue beside it, a second provider, test payments in the report and a source gone quiet earn none.
func TestVerifiedSourceOfPicture(t *testing.T) {
	now := time.Now()
	recent := now.Add(-time.Hour).Unix()
	pay := func(list ...revenue.Connection) verified {
		return verified{Sources: verifiedSources(verifiedIn{Now: now, Pay: list})}
	}
	search := func(lastErr string) verified {
		return verified{Sources: verifiedSources(verifiedIn{Now: now, Search: &sqlite.SearchConsole{Property: "sc-domain:x.com", Created: recent, LastOK: recent, LastError: lastErr}})}
	}
	live, test := &query.Money{}, &query.Money{Test: true}
	for _, c := range []struct {
		name  string
		v     verified
		kind  string
		money *query.Money
		want  string
	}{
		{"stripe", pay(conn("stripe", "live", recent)), "payments", live, "stripe"},
		{"paddle", pay(conn("paddle", "live", recent)), "payments", live, "paddle"},
		{"lemon squeezy", pay(conn("lemonsqueezy", "live", recent)), "payments", live, "lemonsqueezy"},
		{"dodo", pay(conn("dodo", "live", recent)), "payments", live, "dodo"},
		{"polar", pay(conn("polar", "live", recent)), "payments", live, "polar"},
		{"paypal has no mark", pay(conn("paypal", "live", recent)), "payments", live, ""},
		{"only typed in", pay(conn("custom", "live", recent)), "payments", live, ""},
		{"typed in beside stripe", pay(conn("stripe", "live", recent), conn("custom", "live", recent)), "payments", live, ""},
		{"two providers", pay(conn("stripe", "live", recent), conn("paddle", "live", recent)), "payments", live, ""},
		{"a provider and one with no mark", pay(conn("stripe", "live", recent), conn("paypal", "live", recent)), "payments", live, ""},
		{"a test connection beside a live one is no live money", pay(conn("stripe", "live", recent), conn("stripe", "test", recent)), "payments", live, "stripe"},
		{"test payments in the report", pay(conn("stripe", "live", recent)), "payments", test, ""},
		{"no money in the report", pay(conn("stripe", "live", recent)), "payments", nil, ""},
		{"quiet for 40 days", pay(conn("stripe", "live", now.Add(-40*24*time.Hour).Unix())), "payments", live, ""},
		{"payments are not search", pay(conn("stripe", "live", recent)), "gsc", live, ""},
		{"search", search(""), "gsc", nil, cards.SourceSearch},
		{"search refused", search("401"), "gsc", nil, ""},
		{"search is not payments", search(""), "payments", live, ""},
	} {
		if got := verifiedSourceOf(c.v, c.kind, c.money); got != c.want {
			t.Errorf("%s: %q, want %q", c.name, got, c.want)
		}
	}
}

// The sales picture carries its provider's badge, and vouch puts none on a picture with nothing in it.
func TestSalesBadgeNeedsRevenue(t *testing.T) {
	n := &cardNumbers{money: "$1,200", digests: map[string]digest{}}
	n.salesPicture(&query.Result{Money: &query.Money{Payments: 3}})
	d := n.digests["sales"]
	d.source, d.badge = "stripe", cardWords.searchBadge
	n.digests["sales"] = d
	var s cards.Spec
	n.pictureOf(&s, "sales")
	if s.Source != "stripe" || s.Badge == "" || len(s.Stats) != 2 {
		t.Fatalf("a sales picture with revenue has no provider badge: %+v", s)
	}

	n = &cardNumbers{digests: map[string]digest{}}
	n.salesPicture(&query.Result{Money: &query.Money{}})
	empty := n.digests["sales"]
	var a API
	a.vouch(cardReading{}, &empty, "payments", "Verified") // nothing to vouch for: returns before it reads anything
	if empty.source != "" || empty.badge != "" {
		t.Fatalf("a sales picture with no revenue has a badge: %+v", empty)
	}
}

// Every picture that shows revenue carries the badge, and one that does not never does.
func TestMoneyBadgeOnEveryRevenuePicture(t *testing.T) {
	for _, c := range []struct {
		name string
		n    cardNumbers
		tpl  string
		want bool
	}{
		{"revenue metric", cardNumbers{Metric: "revenue", moneySource: "stripe"}, "overview", true},
		{"revenue metric on numbers", cardNumbers{Metric: "revenue", moneySource: "paddle"}, "numbers", true},
		{"revenue number card", cardNumbers{Metric: "visitors", moneyStat: true, moneySource: "stripe"}, "overview", true},
		{"revenue in the grid", cardNumbers{moneyGrid: true, moneySource: "stripe"}, "grid", true},
		{"visitors only", cardNumbers{Metric: "visitors", moneySource: "stripe"}, "overview", false},
		{"grid without revenue", cardNumbers{moneySource: "stripe"}, "grid", false},
		{"the grid's revenue is not the overview's", cardNumbers{moneyGrid: true, moneySource: "stripe"}, "overview", false},
		{"revenue, not all verified", cardNumbers{Metric: "revenue"}, "overview", false},
		{"a list", cardNumbers{Metric: "revenue", moneySource: "stripe"}, "leaderboard", false},
	} {
		var s cards.Spec
		c.n.vouchMoney(&s, c.tpl)
		if got := s.Badge != "" && s.Source == c.n.moneySource; got != c.want {
			t.Errorf("%s: badge %v, want %v", c.name, got, c.want)
		}
	}
}
