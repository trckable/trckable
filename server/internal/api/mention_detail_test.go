package api

import (
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func (g *rig) session(t *testing.T, id int, from, page, country string, goals int, at time.Time) {
	t.Helper()
	_, err := g.api.Query().DB.Exec(`INSERT INTO sessions (site_id, session_id, visitor_id, start, last, referrer, entry_page, country, pvs, goals, engaged_ms, dur)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, 0)`, g.site, id, id, at.UTC(), at.UTC(), from, page, country, goals)
	if err != nil {
		t.Fatal(err)
	}
}

func TestMentionDetailAndCurves(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	now := g.advance(0)
	posted := now.Add(-5 * time.Hour)
	g.mention(t, sqlite.Mention{Source: "hn", URL: "https://news.ycombinator.com/item?id=1", Title: "Show HN", Host: "news.ycombinator.com", PostedAt: posted.Unix()}, 3, posted.Unix())
	g.session(t, 1, "news.ycombinator.com", "/", "US", 1, posted.Add(5*time.Minute))
	g.session(t, 2, "news.ycombinator.com", "/pricing", "US", 0, posted.Add(20*time.Minute))
	g.session(t, 3, "news.ycombinator.com", "/", "DE", 0, posted.Add(3*time.Hour))
	g.session(t, 4, "google.com", "/", "FR", 0, posted.Add(10*time.Minute))
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/mentions"

	_, list := do(t, c, "GET", base, "")
	id := list["mentions"].([]any)[0].(map[string]any)["id"].(float64)

	code, out := do(t, c, "GET", base+"/curves", "")
	if code != http.StatusOK {
		t.Fatalf("%d %v", code, out)
	}
	curves, _ := out["curves"].(map[string]any)
	if len(curves) != 1 {
		t.Fatalf("%v", out)
	}
	for _, v := range curves {
		hours := v.([]any)
		if len(hours) != curveBuckets || hours[0] != float64(2) || hours[3] != float64(1) {
			t.Fatalf("hour by hour, from ten minutes before: %v", hours)
		}
	}

	code, det := do(t, c, "GET", base+"/"+strconv.FormatInt(int64(id), 10), "")
	if code != http.StatusOK {
		t.Fatalf("%d %v", code, det)
	}
	if usual := det["usual"].([]any); usual[0] != float64(3) {
		t.Fatalf("everyone, for the usual: %v", usual)
	}
	pages := det["pages"].([]any)
	if len(pages) != 2 || pages[0].(map[string]any)["name"] != "/" || pages[0].(map[string]any)["visitors"] != float64(2) {
		t.Fatalf("pages: %v", pages)
	}
	if det["goals"] != float64(1) || det["countries"].([]any)[0].(map[string]any)["name"] != "US" {
		t.Fatalf("%v", det)
	}
	if code, _ := do(t, c, "GET", base+"/99999", ""); code != http.StatusNotFound {
		t.Fatalf("%d", code)
	}
}
