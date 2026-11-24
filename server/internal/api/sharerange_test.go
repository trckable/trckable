package api

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The share studio's links carry the period their owner picked: a range or all time (kept as its first day)
// is fixed when the link is made, and nothing in the address changes it.
func TestShareLinkKeepsItsPeriod(t *testing.T) {
	g := newRig(t)
	noOutbound(t, g)
	c := client()
	g.setup(t, c)
	c.Timeout = 60e9
	now := g.advance(0) // 2026-09-22 12:00 UTC
	for i, d := range []int{200, 20, 5, 0} {
		n := uint64(i + 1)
		g.event(t, event.Event{Kind: event.KindPageview, EventID: n, Pageview: n, TS: now.AddDate(0, 0, -d).UnixMilli(), Visitor: n, Path: "/"})
	}
	g.waitApplied(t, 4)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	make := func(period string) (code int, token, stored string) {
		code, out := do(t, c, "POST", base+"/shares", `{"name":"Share studio","period":"`+period+`"}`, csrf, "1")
		if code != http.StatusCreated {
			return code, "", ""
		}
		u := out["url"].(string)
		return code, u[strings.LastIndex(u, "/")+1:], out["share"].(map[string]any)["period"].(string)
	}
	// A start further back than the site's data is its first day; a range that ends before it, or is too long, is refused.
	if _, _, stored := make("since:0001-01-01"); stored != "since:2026-03-06" {
		t.Errorf("since the year 1: kept as %q", stored)
	}
	if _, _, stored := make("1990-01-01..2026-09-10"); stored != "2026-03-06..2026-09-10" {
		t.Errorf("a range from before the data: kept as %q", stored)
	}
	if code, _, _ := make("1990-01-01..2026-01-01"); code != http.StatusBadRequest {
		t.Errorf("a range that ends before the data: %d, want 400", code)
	}
	// What cannot be a period is refused, and nothing is made.
	for _, bad := range []string{"custom", "2026-09-10..2026-09-01", "2026-09-10..2026-09-30", "2026-13-01..2026-13-02", "since:2026-10-01", "since:soon", "1d"} {
		if code, _, _ := make(bad); code != http.StatusBadRequest {
			t.Errorf("%q: %d, want 400", bad, code)
		}
	}
	foot := func(token string, ask string) string {
		sh, ok := g.api.openLink(httptest.NewRequest(http.MethodGet, "/s/"+token, nil), token)
		if !ok {
			t.Fatal("the link does not open")
		}
		req := httptest.NewRequest(http.MethodGet, "/s/"+token+"/card.png?"+ask, nil)
		q := g.api.linkCard(req, sh)
		n := g.cardOf(t, q.Encode())
		return n.Foot + "|" + n.Big
	}
	for _, c := range []struct{ period, stored, foot string }{
		{"2026-09-01..2026-09-10", "2026-09-01..2026-09-10", "1 Sep – 10 Sep 2026|1"},
		{"2026-08-30..2026-09-22", "2026-08-30..2026-09-22", "30 Aug – 22 Sep 2026|3"},
		{"all", "since:2026-03-06", "Since 6 Mar 2026|4"},
		{"12mo", "12mo", "Last 12 months|4"},
		{"30d", "30d", "Last 30 days|3"},
	} {
		code, token, stored := make(c.period)
		if code != http.StatusCreated || stored != c.stored {
			t.Fatalf("%q: %d, kept as %q, want %q", c.period, code, stored, c.stored)
		}
		want := foot(token, "")
		if want != c.foot {
			t.Errorf("%q: the card says %q, want %q", c.period, want, c.foot)
		}
		// The address cannot change it: not the period, not the days.
		for _, ask := range []string{"period=7d", "period=all", "period=custom&from=2020-01-01&to=2026-09-22", "from=2020-01-01&to=2020-01-02&period=30d"} {
			if got := foot(token, ask); got != want {
				t.Errorf("%q asked %q: %q, want %q", c.period, ask, got, want)
			}
		}
		// And so the picture is the same one, drawn once (for one period: a picture is slow under the race detector).
		if c.period != "all" {
			continue
		}
		var first []byte
		for _, ask := range []string{"", "?period=7d&from=2020-01-01&to=2020-01-02"} {
			req := httptest.NewRequest(http.MethodGet, "/s/"+token+"/card.png"+ask, nil)
			req.SetPathValue("token", token)
			rec := httptest.NewRecorder()
			g.api.SharePreviewImage(rec, req)
			if rec.Code != http.StatusOK {
				t.Fatalf("%q%s: %d", c.period, ask, rec.Code)
			}
			if first == nil {
				first = rec.Body.Bytes()
			} else if string(first) != rec.Body.String() {
				t.Errorf("%q: the picture changed with the address %s", c.period, ask)
			}
		}
	}
}

// What a card says its period is, in each kind: a preset, a range, a year, and all time from its first day.
func TestCardPeriodWords(t *testing.T) {
	now := time.Date(2026, 11, 9, 15, 30, 0, 0, time.UTC)
	first := time.Date(2024, 2, 4, 9, 0, 0, 0, time.UTC)
	for _, c := range []struct{ name, from, to, want string }{
		{"7d", "", "", "Last 7 days"},
		{"30d", "", "", "Last 30 days"},
		{"12mo", "", "", "Last 12 months"},
		{"custom", "2026-03-01", "2026-06-14", "1 Mar – 14 Jun 2026"},
		{"custom", "2025-12-01", "2026-06-14", "1 Dec 2025 – 14 Jun 2026"},
		{"all", "", "", "Since 4 Feb 2024"},
		{"since", "2025-01-02", "", "Since 2 Jan 2025"},
	} {
		if p := resolvePeriod(cardWords, c.name, c.from, c.to, now, first, false); p.label != c.want {
			t.Errorf("%s %s %s: %q, want %q", c.name, c.from, c.to, p.label, c.want)
		}
	}
}

// The card's words name the site's first day of data, the earliest a period can start.
func TestCardWordsNameTheFirstDay(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	now := g.advance(0)
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 1, Pageview: 1, TS: now.AddDate(0, 0, -40).UnixMilli(), Visitor: 1, Path: "/"})
	g.waitApplied(t, 1)
	v := url.Values{"period": {"30d"}}
	r := httptest.NewRequest(http.MethodGet, "/api/v1/sites/"+g.site+"/card?"+v.Encode(), nil)
	n, ok := g.api.cardRead(httptest.NewRecorder(), r, g.api.Query(), g.site, v, "")
	if !ok || n.First != "2026-08-13" {
		t.Errorf("first day %q (%v), want 2026-08-13", n.First, ok)
	}
}

// The links list names each fixed period with the card's own words, in the language asked for.
func TestShareListNamesPeriods(t *testing.T) {
	now := time.Date(2026, 11, 9, 15, 30, 0, 0, time.UTC)
	for _, c := range []struct{ code, period, want string }{
		{"en", "12mo", "Last 12 months"},
		{"en", "2026-03-01..2026-06-14", "1 Mar – 14 Jun 2026"},
		{"en", "since:2024-02-04", "Since 4 Feb 2024"},
		{"de", "30d", "Letzte 30 Tage"},
		{"en", "", ""},
	} {
		if got := sharePeriodLabel(cardLangOf(c.code), c.period, now); got != c.want {
			t.Errorf("%s %q: %q, want %q", c.code, c.period, got, c.want)
		}
	}
}

// The card and the page of a link are drawn from the same days, for a stored period that is good and for one that is not.
func TestCardDaysAreThePageDays(t *testing.T) {
	now := time.Date(2026, 11, 9, 15, 30, 0, 0, time.UTC)
	for _, p := range []string{"7d", "30d", "12mo", "2026-03-01..2026-06-14", "since:2024-02-04", "since:0001-01-01", "1990-01-01..2026-01-01", "since:2030-01-01", "2026-06-14..2026-03-01"} {
		q := linkCardQuery(sqlite.Share{Period: p}, nil)
		card := resolvePeriod(cardWords, q.Get("period"), q.Get("from"), q.Get("to"), now, time.Time{}, false)
		from, to, _ := fixedDays(p, now)
		if !card.from.Equal(from) || !card.to.Equal(to) {
			t.Errorf("%q: the card covers %s..%s, the page %s..%s", p, card.from.Format(time.DateOnly), card.to.Format(time.DateOnly), from.Format(time.DateOnly), to.Format(time.DateOnly))
		}
	}
}
