package api

import (
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/cards"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/revenue"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// A badge names the source that really delivers: Search Console, or the payment provider that has a mark; a provider
// without a mark, one typed in by hand, a test one and one that has gone quiet earn none.
func TestVerifiedSourceOfPicture(t *testing.T) {
	now := time.Now()
	recent := now.Add(-time.Hour).Unix()
	pay := func(provider, mode string, last int64) verified {
		return verified{Sources: verifiedSources(verifiedIn{Now: now, Pay: []revenue.Connection{{Provider: provider, Mode: mode, LastEvent: &last, CreatedAt: recent}}})}
	}
	search := func(lastErr string) verified {
		return verified{Sources: verifiedSources(verifiedIn{Now: now, Search: &sqlite.SearchConsole{Property: "sc-domain:x.com", Created: recent, LastOK: recent, LastError: lastErr}})}
	}
	for _, c := range []struct {
		name string
		v    verified
		kind string
		want string
	}{
		{"stripe", pay("stripe", "live", recent), "payments", "stripe"},
		{"paddle", pay("paddle", "live", recent), "payments", "paddle"},
		{"lemon squeezy", pay("lemonsqueezy", "live", recent), "payments", "lemonsqueezy"},
		{"dodo", pay("dodo", "live", recent), "payments", "dodo"},
		{"polar", pay("polar", "live", recent), "payments", "polar"},
		{"paypal has no mark", pay("paypal", "live", recent), "payments", ""},
		{"typed in", pay("custom", "live", recent), "payments", ""},
		{"test mode", pay("stripe", "test", recent), "payments", ""},
		{"quiet for 40 days", pay("stripe", "live", now.Add(-40*24*time.Hour).Unix()), "payments", ""},
		{"payments are not search", pay("stripe", "live", recent), "gsc", ""},
		{"search", search(""), "gsc", cards.SourceSearch},
		{"search refused", search("401"), "gsc", ""},
		{"search is not payments", search(""), "payments", ""},
	} {
		if got := verifiedSourceOf(c.v, c.kind); got != c.want {
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
	a.vouch(cardReading{}, &empty, "payments") // nothing to vouch for: returns before it reads anything
	if empty.source != "" || empty.badge != "" {
		t.Fatalf("a sales picture with no revenue has a badge: %+v", empty)
	}
}
