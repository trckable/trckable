package api

import (
	"context"
	"image"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/cards"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// What a link's address may ask of its picture: its own choices, each checked, and never more than the link shows.
func TestLinkCardQuery(t *testing.T) {
	all := sqlite.Share{Sections: sqlite.ShareSections}
	headline := sqlite.Share{}
	for _, c := range []struct {
		name  string
		share sqlite.Share
		in    string
		want  map[string]string
	}{
		{"nothing asked", all, "", map[string]string{"t": "overview", "period": "7d", "shape": "link", "theme": "dark"}},
		{"a size of every place", all, "t=toppage&period=30d&shape=portrait&theme=light&bg=ocean&accent=%23ffb547&name=0", map[string]string{"t": "toppage", "period": "30d", "shape": "portrait", "theme": "light", "bg": "ocean", "accent": "#ffb547", "name": "0"}},
		{"a colour of the palette in capitals", all, "accent=%23B8FF3C", map[string]string{"accent": "#b8ff3c"}},
		{"a colour outside the palette", all, "accent=%23123456", map[string]string{}},
		{"a section the link hides", headline, "t=sources", map[string]string{"t": "overview"}},
		{"revenue is never drawn", all, "t=sales&metric=revenue&stats=revenue", map[string]string{"t": "overview", "stats": "engaged"}},
		{"nonsense is the default", all, "period=24h&shape=huge&bg=plaid&accent=red&theme=neon", map[string]string{"period": "7d", "shape": "link", "theme": "dark"}},
		{"a milestone", all, "t=milestone&ms=visitors~10000", map[string]string{"t": "milestone", "ms": "visitors~10000"}},
		{"a money milestone", all, "t=milestone&ms=revenue~1000", map[string]string{"t": "overview"}},
		{"a milestone with no name", all, "t=milestone", map[string]string{"t": "overview"}},
		{"what changed on a headline link", headline, "t=changed", map[string]string{"t": "overview"}},
		{"what changed on a link missing one section", sqlite.Share{Sections: []string{"pages", "sources", "places"}}, "t=changed", map[string]string{"t": "overview"}},
		{"what changed on a link showing everything", all, "t=changed", map[string]string{"t": "changed"}},
		{"a link fixed to a week", sqlite.Share{Sections: sqlite.ShareSections, Period: "7d"}, "period=30d", map[string]string{"period": "7d"}},
		{"a link fixed to a month", sqlite.Share{Period: "30d"}, "period=7d", map[string]string{"period": "30d"}},
		{"a link fixed to a year", sqlite.Share{Period: "12mo"}, "period=7d", map[string]string{"period": "12mo"}},
		{"a link fixed to a range", sqlite.Share{Period: "2026-03-01..2026-06-14"}, "period=7d&from=2026-01-01&to=2026-01-02", map[string]string{"period": "custom", "from": "2026-03-01", "to": "2026-06-14"}},
		{"a link fixed to all time", sqlite.Share{Period: "since:2024-02-04"}, "period=30d&from=2026-01-01&to=2026-01-02", map[string]string{"period": "since", "from": "2024-02-04"}},
		{"all time is not offered to a reader", all, "period=all", map[string]string{"period": "7d"}},
		{"a range is not offered to a reader", all, "period=custom&from=2026-01-01&to=2026-01-02", map[string]string{"period": "7d"}},
		{"a search milestone on a link without sources", headline, "t=milestone&ms=search_clicks~100", map[string]string{"t": "overview"}},
		{"a search milestone on a link with sources", sqlite.Share{Sections: []string{"sources"}}, "t=milestone&ms=search_clicks~100", map[string]string{"t": "milestone", "ms": "search_clicks~100"}},
		{"a countries milestone on a link without places", headline, "t=milestone&ms=countries~10", map[string]string{"t": "overview"}},
		{"a countries milestone on a link with places", sqlite.Share{Sections: []string{"places"}}, "t=milestone&ms=countries~10", map[string]string{"t": "milestone", "ms": "countries~10"}},
		{"an AI milestone is never carried", all, "t=milestone&ms=ai_visits~10", map[string]string{"t": "overview"}},
		{"a first sale is never carried", all, "t=milestone&ms=first_sale~1", map[string]string{"t": "overview"}},
		{"a milestone of another picture", all, "t=overview&ms=visitors~10000", map[string]string{"t": "overview"}},
	} {
		got := linkCardQuery(c.share, mustQuery(t, c.in))
		for k, v := range c.want {
			if got.Get(k) != v {
				t.Errorf("%s: %s = %q, want %q (%v)", c.name, k, got.Get(k), v, got)
			}
		}
		for _, k := range []string{"ms", "bg", "accent", "name", "from", "to"} {
			if _, asked := c.want[k]; !asked && got.Has(k) {
				t.Errorf("%s: %s was let through (%v)", c.name, k, got)
			}
		}
	}
}

func mustQuery(t *testing.T, s string) url.Values {
	t.Helper()
	v, err := url.ParseQuery(s)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

// A link whose address names a card carries that card, at that size, as its preview picture: the tags say the size
// the picture has, and the picture is drawn at exactly it.
func TestSharePreviewCardSize(t *testing.T) {
	g := newRig(t)
	noOutbound(t, g)
	c := client()
	g.setup(t, c)
	c.Timeout = 60e9
	base := g.srv.URL + "/api/v1/sites/" + g.site
	_, open := do(t, c, "POST", base+"/shares", `{"name":"Board"}`, csrf, "1")
	u := open["url"].(string)
	token := u[strings.LastIndex(u, "/")+1:]
	for _, f := range cards.Formats {
		page := "/s/" + token + "?t=numbers&period=30d&shape=" + f.ID + "&bg=sunset"
		_, tags := g.api.SharePreview(httptest.NewRequest(http.MethodGet, page, nil))
		wantImage := `/s/` + token + `/card.png?`
		if !strings.Contains(tags, wantImage) || !strings.Contains(tags, "shape="+f.ID) {
			t.Fatalf("%s: the picture is not the one asked for: %s", f.ID, tags)
		}
		if want := `<meta property="og:image:width" content="` + strconv.Itoa(f.W) + `"><meta property="og:image:height" content="` + strconv.Itoa(f.H) + `">`; !strings.Contains(tags, want) {
			t.Errorf("%s: the tags say another size than %d × %d: %s", f.ID, f.W, f.H, tags)
		}
		req := httptest.NewRequest(http.MethodGet, "/s/"+token+"/card.png?"+strings.SplitN(page, "?", 2)[1], nil)
		req.SetPathValue("token", token)
		rec := httptest.NewRecorder()
		g.api.SharePreviewImage(rec, req)
		cfg, _, err := image.DecodeConfig(rec.Body)
		if rec.Code != http.StatusOK || err != nil || cfg.Width != f.W || cfg.Height != f.H {
			t.Errorf("%s: %d, %dx%d (%v), want %d × %d", f.ID, rec.Code, cfg.Width, cfg.Height, err, f.W, f.H)
		}
	}
	// With no card named the link keeps the overview at the link preview's size.
	_, tags := g.api.SharePreview(httptest.NewRequest(http.MethodGet, "/s/"+token, nil))
	if !strings.Contains(tags, `content="1200"><meta property="og:image:height" content="630"`) || strings.Contains(tags, "card.png?") {
		t.Errorf("a bare link changed: %s", tags)
	}
}

// The post's picture says whether the period has a best day, and a 24-hour period has none to name.
func TestCardBestDay(t *testing.T) {
	g := newRig(t)
	noOutbound(t, g)
	owner := client()
	g.setup(t, owner)
	card := g.srv.URL + "/api/v1/sites/" + g.site + "/card"
	code, _, body := get(t, owner, card+"?format=json&period=30d")
	if code != http.StatusOK || !strings.Contains(body, `"has_bestday"`) {
		t.Fatalf("%d: %s", code, body)
	}
	code, _, body = get(t, owner, card+"?format=json&period=24h")
	if code != http.StatusOK || !strings.Contains(body, `"has_bestday":false`) {
		t.Errorf("a day read by the hour has a best day: %d %s", code, body)
	}
}

// A picture drawn for a link's address is kept for ten minutes and then drawn again; the cache stays small.
func TestLinkPNGCache(t *testing.T) {
	c := &linkCache{m: map[string]linkPNG{}}
	now := time.Date(2026, 11, 23, 12, 0, 0, 0, time.UTC)
	c.put("a", []byte("x"), now)
	if b, ok := c.get("a", now.Add(linkPNGTTL-time.Second)); !ok || string(b) != "x" {
		t.Fatal("not kept")
	}
	if _, ok := c.get("a", now.Add(linkPNGTTL+time.Second)); ok {
		t.Fatal("kept past its time")
	}
	for i := 0; i < linkPNGKept*2; i++ {
		c.put(strconv.Itoa(i), []byte("y"), now.Add(time.Duration(i)*time.Second))
	}
	if len(c.m) != linkPNGKept {
		t.Fatalf("%d kept", len(c.m))
	}
	// The oldest go first, not everything at once.
	c.put("new", []byte("z"), now.Add(time.Duration(linkPNGKept*2)*time.Second))
	if _, ok := c.get("new", now.Add(time.Duration(linkPNGKept*2)*time.Second)); !ok || len(c.m) != linkPNGKept {
		t.Fatalf("%d kept", len(c.m))
	}
	if _, ok := c.m[strconv.Itoa(linkPNGKept)]; ok {
		t.Fatal("the oldest stayed")
	}
	if _, ok := c.m[strconv.Itoa(linkPNGKept*2-2)]; !ok {
		t.Fatal("a newer one went")
	}
}

// The bytes kept stay under their cap: a big picture pushes out the oldest, and one that cannot fit is not kept.
func TestLinkPNGCacheBytes(t *testing.T) {
	c := &linkCache{m: map[string]linkPNG{}}
	now := time.Date(2026, 11, 23, 12, 0, 0, 0, time.UTC)
	big := make([]byte, linkPNGBytes/4+1)
	for i := 0; i < 6; i++ {
		c.put(strconv.Itoa(i), big, now.Add(time.Duration(i)*time.Second))
		if c.bytes > linkPNGBytes {
			t.Fatalf("%d bytes kept", c.bytes)
		}
	}
	if _, ok := c.m["0"]; ok {
		t.Fatal("the oldest stayed")
	}
	if _, ok := c.m["5"]; !ok {
		t.Fatal("the newest was not kept")
	}
	c.put("huge", make([]byte, linkPNGBytes+1), now)
	if _, ok := c.m["huge"]; ok {
		t.Fatal("a picture over the cap was kept")
	}
}

// A milestone is drawn for a link only when the site has reached it.
func TestSharePreviewMilestoneReached(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	_, open := do(t, c, "POST", base+"/shares", `{"name":"Board"}`, csrf, "1")
	u := open["url"].(string)
	token := u[strings.LastIndex(u, "/")+1:]
	if _, err := g.ctl.AddMilestones(context.Background(), g.site, []sqlite.Milestone{{Kind: "visitors", Step: "100", Value: 100, Day: "2026-09-18"}}); err != nil {
		t.Fatal(err)
	}
	for ms, want := range map[string]string{"visitors~100": "t=milestone", "visitors~100000": "t=overview", "nonsense": "t=overview"} {
		_, tags := g.api.SharePreview(httptest.NewRequest(http.MethodGet, "/s/"+token+"?t=milestone&ms="+ms, nil))
		if !strings.Contains(tags, want) {
			t.Errorf("%s: %s", ms, tags)
		}
	}
}
