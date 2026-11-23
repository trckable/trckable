package api

import (
	"image"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"

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
		{"a size of every place", all, "t=toppage&period=30d&shape=portrait&theme=light&bg=ocean&accent=%23ff8a5c&name=0", map[string]string{"t": "toppage", "period": "30d", "shape": "portrait", "theme": "light", "bg": "ocean", "accent": "#ff8a5c", "name": "0"}},
		{"a section the link hides", headline, "t=sources", map[string]string{"t": "overview"}},
		{"revenue is never drawn", all, "t=sales&metric=revenue&stats=revenue", map[string]string{"t": "overview", "stats": "engaged"}},
		{"nonsense is the default", all, "period=24h&shape=huge&bg=plaid&accent=red&theme=neon", map[string]string{"period": "7d", "shape": "link", "theme": "dark"}},
		{"a milestone", all, "t=milestone&ms=sites~1", map[string]string{"t": "milestone", "ms": "sites~1"}},
		{"a money milestone", all, "t=milestone&ms=revenue~1000", map[string]string{"t": "overview"}},
		{"a milestone with no name", all, "t=milestone", map[string]string{"t": "overview"}},
		{"a milestone of another picture", all, "t=overview&ms=sites~1", map[string]string{"t": "overview"}},
	} {
		got := linkCardQuery(c.share, mustQuery(t, c.in))
		for k, v := range c.want {
			if got.Get(k) != v {
				t.Errorf("%s: %s = %q, want %q (%v)", c.name, k, got.Get(k), v, got)
			}
		}
		for _, k := range []string{"ms", "bg", "accent", "name"} {
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
