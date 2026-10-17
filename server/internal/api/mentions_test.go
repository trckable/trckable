package api

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func (g *rig) mention(t *testing.T, m sqlite.Mention, visitors, peak int64) {
	t.Helper()
	ctx := context.Background()
	m.Site = g.site
	if _, err := g.api.Ctl.SaveMention(ctx, m, m.PostedAt); err != nil {
		t.Fatal(err)
	}
	list, _ := g.api.Ctl.Mentions(ctx, g.site, m.PostedAt, m.PostedAt+1, 1)
	if err := g.api.Ctl.SaveScore(ctx, list[0].ID, visitors, peak, m.PostedAt); err != nil {
		t.Fatal(err)
	}
}

func TestMentionsListWordsAndDriving(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	g.api.MentionSources = []string{"hn", "news"}
	now := g.advance(0)
	posted := now.Add(-2 * time.Hour)
	g.mention(t, sqlite.Mention{Source: "hn", URL: "https://news.ycombinator.com/item?id=1", Title: "Show HN", Host: "news.ycombinator.com", PostedAt: posted.Unix(), Front: true}, 212, now.Add(-time.Hour).Truncate(time.Hour).Unix())
	g.mention(t, sqlite.Mention{Source: "news", URL: "https://blog.example/a", Title: "Old news", Host: "blog.example", PostedAt: now.Add(-20 * 24 * time.Hour).Unix()}, 5, now.Add(-20*24*time.Hour).Unix())
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/mentions"

	code, out := do(t, c, "GET", base, "")
	if code != http.StatusOK {
		t.Fatalf("%d %v", code, out)
	}
	list, _ := out["mentions"].([]any)
	if len(list) != 2 {
		t.Fatalf("newest first, both inside 30 days: %v", list)
	}
	first := list[0].(map[string]any)
	if first["source"] != "hn" || first["visitors"] != float64(212) || first["front"] != true || first["driving"] != true {
		t.Fatalf("%v", first)
	}
	if d, _ := out["driving"].(map[string]any); d["source"] != "hn" {
		t.Fatalf("the one driving visitors now: %v", out["driving"])
	}
	if srcs, _ := out["sources"].([]any); len(srcs) != 2 {
		t.Fatalf("sources: %v", out["sources"])
	}
	words, _ := out["words"].(map[string]any)
	if def, _ := words["default"].([]any); len(def) != 2 || def[0] != "site.com" || def[1] != "www.site.com" {
		t.Fatalf("a site's own address is searched: %v", words)
	}

	// A shorter period leaves the old one out; a bad one is refused.
	_, short := do(t, c, "GET", base+"?period=7d", "")
	if l, _ := short["mentions"].([]any); len(l) != 1 {
		t.Fatalf("7d: %v", l)
	}
	if code, _ := do(t, c, "GET", base+"?period=forever", ""); code != http.StatusBadRequest {
		t.Fatalf("%d", code)
	}
}

func TestMentionKeywordsSaveAndRefuse(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	url := g.srv.URL + "/api/v1/sites/" + g.site + "/mentions/keywords"
	code, out := do(t, c, "PUT", url, `{"keywords":["Site Pro","@sitepro"]}`, csrf, "1")
	if code != http.StatusOK {
		t.Fatalf("%d %v", code, out)
	}
	if added, _ := out["added"].([]any); len(added) != 2 || added[0] != "Site Pro" {
		t.Fatalf("%v", out)
	}
	if code, out = do(t, c, "PUT", url, `{"keywords":["ab"]}`, csrf, "1"); code != http.StatusBadRequest || !strings.Contains(out["error"].(string), "3 to 60") {
		t.Fatalf("%d %v", code, out)
	}
	if _, out = do(t, c, "GET", url, ""); len(out["added"].([]any)) != 2 {
		t.Fatalf("a refused list changed nothing: %v", out)
	}
}

// A mention that explains a spike is told with it; one that does not is a moment of its own.
func TestMentionMomentsJoinTheSpikeTheyExplain(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	at := time.Date(2026, 9, 22, 10, 10, 0, 0, time.UTC)
	g.mention(t, sqlite.Mention{Source: "ph", URL: "https://www.producthunt.com/posts/x", Title: "X launch", Host: "producthunt.com", PostedAt: at.Unix()}, 40, at.Unix())
	g.mention(t, sqlite.Mention{Source: "hn", URL: "https://news.ycombinator.com/item?id=2", Title: "Show HN", Host: "news.ycombinator.com", PostedAt: at.Add(time.Hour).Unix()}, 0, 0)
	day := "2026-09-22"
	code, _, body := get(t, c, g.srv.URL+"/api/v1/sites/"+g.site+"/moments?bucket=hour&from="+day+"&to="+day)
	if code != http.StatusOK || !strings.Contains(body, `"kind":"mention"`) || !strings.Contains(body, `"mention":"ph"`) || !strings.Contains(body, `"brought":40`) || !strings.Contains(body, `"t":"2026-09-22T10:00"`) {
		t.Fatalf("%d %s", code, body)
	}
	if strings.Contains(body, "Show HN") {
		t.Fatalf("a mention that brought nobody is not a moment: %s", body)
	}
}

// Switched off, Mentions answers nothing and no other answer carries one.
func TestMentionsOffShowsNothingAnywhere(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	now := g.advance(0)
	g.mention(t, sqlite.Mention{Source: "hn", URL: "https://news.ycombinator.com/item?id=1", Title: "Show HN", Host: "news.ycombinator.com", PostedAt: now.Add(-2 * time.Hour).Unix()}, 212, now.Add(-time.Hour).Truncate(time.Hour).Unix())
	g.api.MentionsOn = false
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/mentions"
	for _, path := range []string{base, base + "/keywords", base + "/curves", base + "/1", base + "/rules", base + "/hidden", base + "/lookalike?word=acme"} {
		if code, _ := do(t, c, "GET", path, ""); code != http.StatusNotFound {
			t.Errorf("%s answered %d with Mentions off", path, code)
		}
	}
	if code, _ := do(t, c, "PUT", base+"/keywords", `{"keywords":["acme"]}`, csrf, "1"); code != http.StatusNotFound {
		t.Errorf("words saved with Mentions off: %d", code)
	}
	for _, path := range []string{base + "/rules", base + "/1/not-about-us", base + "/1/restore"} {
		if code, _ := do(t, c, map[bool]string{true: "PUT", false: "POST"}[strings.HasSuffix(path, "/rules")], path, `{}`, csrf, "1"); code != http.StatusNotFound {
			t.Errorf("%s answered %d with Mentions off", path, code)
		}
	}
	if _, out := do(t, c, "GET", g.srv.URL+"/api/v1/me", ""); out["mentions"] != false {
		t.Errorf("/me says %v", out["mentions"])
	}
	_, sites := do(t, c, "GET", g.srv.URL+"/api/v1/sites", "")
	for _, s := range sites["sites"].([]any) {
		if s.(map[string]any)["mentions"] == true {
			t.Errorf("the site list counts a mention: %v", s)
		}
	}
}
