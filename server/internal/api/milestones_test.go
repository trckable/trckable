package api

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/milestones"
	"github.com/trckable/trckable/server/internal/modules"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func get(t *testing.T, c *http.Client, url string) (int, string, string) {
	t.Helper()
	res, err := c.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return res.StatusCode, res.Header.Get("Content-Type"), string(b)
}

// Milestones come from the data, once a day is over: 150 first visits two
// days ago pass the 100 step, found by the nightly check, shown once.
func TestMilestonesFromTheCheck(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	base := g.now.Add(-48 * time.Hour)
	for i := 0; i < 150; i++ {
		g.event(t, event.Event{Kind: event.KindPageview, EventID: uint64(9000 + i), TS: base.Add(time.Duration(i) * time.Minute).UnixMilli(), Visitor: uint64(500 + i), Path: "/", Country: "DE"})
	}
	g.waitApplied(t, 150)
	ctx := context.Background()
	check := func(now time.Time) []sqlite.Milestone {
		t.Helper()
		sites, _ := g.ctl.MilestoneSites(ctx)
		for _, s := range sites {
			if s.ID == g.site {
				fresh, err := milestones.Check(ctx, *g.api.Query(), g.ctl, s, now)
				if err != nil {
					t.Fatal(err)
				}
				return fresh
			}
		}
		t.Fatal("no site")
		return nil
	}
	// Sessions are written once they are idle; wait for them.
	for try := 0; try < 100; try++ {
		var n int
		_ = g.ctl.DB.QueryRow(`SELECT count(*) FROM milestones WHERE site_id = ?`, g.site).Scan(&n)
		if n > 0 {
			break
		}
		_ = g.ctl.SetMilestonesDay(ctx, g.site, "")
		check(g.now)
		time.Sleep(20 * time.Millisecond)
	}
	// The first look back: stored, and its highest step is the moment.
	code, o := do(t, owner, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/milestones?next=1", "")
	if code != http.StatusOK || o["moment"] == nil {
		t.Fatalf("milestones: %d %v", code, o)
	}
	if m := o["moment"].(map[string]any); m["kind"] != "visitors" || m["step"] != "100" || m["day"] != base.Format(time.DateOnly) {
		t.Fatalf("moment: %v", m)
	}
	if n := o["next"].([]any); len(n) == 0 || n[0].(map[string]any)["step"] != 250.0 {
		t.Fatalf("next: %v", o["next"])
	}
	// Checking the same day again adds nothing.
	if fresh := check(g.now); len(fresh) != 0 {
		t.Fatalf("a second run added %v", fresh)
	}
	sites, _ := g.ctl.MilestoneSites(ctx)
	for _, s := range sites {
		if s.ID == g.site && s.Day != g.now.AddDate(0, 0, -1).Format(time.DateOnly) {
			t.Fatalf("day checked: %q", s.Day)
		}
	}
	// Closing it: gone for this person.
	if code, _ := do(t, owner, "POST", g.srv.URL+"/api/v1/sites/"+g.site+"/milestones/seen", `{"keys":[["visitors","100"],["pageviews","1"]]}`, csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("close: %d", code)
	}
	if _, o := do(t, owner, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/milestones", ""); o["moment"] != nil {
		t.Fatalf("closed, still a moment: %v", o["moment"])
	}
}

// Who may do what: anyone of the account reads and closes their own moment;
// only an owner shares; a link opens one milestone and nothing else, hides
// money unless asked, and stops at revoke.
func TestMilestoneSharing(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	ctx := context.Background()
	other, _ := g.ctl.CreateSite(ctx, sqlite.DefaultAccount, "other.com", "")
	_ = modules.Store{DB: g.ctl.DB}.Set(ctx, g.site, "revenue", true)
	_, _ = g.ctl.AddMilestones(ctx, g.site, []sqlite.Milestone{
		{Kind: "visitors", Step: "1000", Value: 1000, Day: "2026-09-20"},
		{Kind: "revenue", Step: "1000", Value: 1000, Currency: "USD", Day: "2026-09-21"},
	})
	_, _ = g.ctl.AddMilestones(ctx, other, []sqlite.Milestone{{Kind: "visitors", Step: "100", Value: 100, Day: "2026-09-19"}})
	if _, err := g.ctl.AddUser(ctx, sqlite.DefaultAccount, "viewer@site.com", "correct horse battery V", sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	viewer := client()
	if code, _ := do(t, viewer, "POST", g.srv.URL+"/api/v1/login", `{"email":"viewer@site.com","password":"correct horse battery V"}`); code != http.StatusOK {
		t.Fatal("viewer signs in")
	}
	site := g.srv.URL + "/api/v1/sites/" + g.site + "/milestones"

	// The biggest new one is the moment: revenue over visitors.
	if _, o := do(t, viewer, "GET", site, ""); o["moment"].(map[string]any)["kind"] != "revenue" {
		t.Fatalf("moment: %v", o)
	}
	// A viewer closes their own; the owner still has it.
	if code, _ := do(t, viewer, "POST", site+"/seen", `{"keys":[["revenue","1000"],["visitors","1000"]]}`, csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("viewer close: %d", code)
	}
	if _, o := do(t, owner, "GET", site, ""); o["moment"] == nil {
		t.Fatal("the viewer closed it for the owner too")
	}
	// A viewer cannot share or revoke; nor can anyone reach another site's.
	if code, _ := do(t, viewer, "POST", site+"/visitors/1000/share", `{}`, csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("viewer share: %d", code)
	}
	if code, _ := do(t, owner, "POST", site+"/visitors/100/share", `{}`, csrf, "1"); code != http.StatusNotFound {
		t.Fatalf("another site's milestone through this one: %d", code)
	}

	// The owner shares revenue without the amount: the link says no number.
	code, o := do(t, owner, "POST", site+"/revenue/1000/share", `{"amount":false}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("share: %d %v", code, o)
	}
	link := o["url"].(string)
	path := link[strings.Index(link, "/m/"):]
	code, ct, body := get(t, client(), g.srv.URL+path)
	if code != http.StatusOK || !strings.HasPrefix(ct, "text/html") || strings.Contains(body, "1,000") || !strings.Contains(body, "Revenue milestone") || !strings.Contains(body, path+".png") {
		t.Fatalf("page: %d %s %s", code, ct, body)
	}
	for _, leak := range []string{"other.com", "visitors", g.site} {
		if strings.Contains(body, leak) {
			t.Fatalf("the page shows %q: %s", leak, body)
		}
	}
	if code, ct, png := get(t, client(), g.srv.URL+path+".png"); code != http.StatusOK || ct != "image/png" || !strings.HasPrefix(png, "\x89PNG") {
		t.Fatalf("png: %d %s", code, ct)
	}
	// Listed as shared; a second link needs a revoke first.
	if code, _ := do(t, owner, "POST", site+"/revenue/1000/share", `{"amount":true}`, csrf, "1"); code != http.StatusConflict {
		t.Fatalf("second link: %d", code)
	}
	// Revenue off: the money milestone and its link are gone.
	_ = modules.Store{DB: g.ctl.DB}.Set(ctx, g.site, "revenue", false)
	if code, _, _ := get(t, client(), g.srv.URL+path); code != http.StatusNotFound {
		t.Fatalf("revenue off, link: %d", code)
	}
	if _, o := do(t, owner, "GET", site, ""); len(o["milestones"].([]any)) != 1 {
		t.Fatalf("revenue off, list: %v", o["milestones"])
	}
	_ = modules.Store{DB: g.ctl.DB}.Set(ctx, g.site, "revenue", true)
	if code, _ := do(t, owner, "DELETE", site+"/revenue/1000/share", "", csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("revoke: %d", code)
	}
	if code, _, _ := get(t, client(), g.srv.URL+path); code != http.StatusNotFound {
		t.Fatalf("revoked link: %d", code)
	}
	// With the amount, a new link shows it.
	_, o = do(t, owner, "POST", site+"/revenue/1000/share", `{"amount":true}`, csrf, "1")
	link = o["url"].(string)
	if _, _, body := get(t, client(), g.srv.URL+link[strings.Index(link, "/m/"):]); !strings.Contains(body, "$1,000 revenue") {
		t.Fatalf("amount on: %s", body)
	}
	// Milestones off: no moment, and links stop.
	if code, _ := do(t, owner, "PUT", site, `{"enabled":false}`, csrf, "1"); code != http.StatusOK {
		t.Fatalf("off: %d", code)
	}
	if _, o := do(t, owner, "GET", site, ""); o["enabled"] != false || o["moment"] != nil {
		t.Fatalf("off: %v", o)
	}
	if code, _, _ := get(t, client(), g.srv.URL+link[strings.Index(link, "/m/"):]); code != http.StatusNotFound {
		t.Fatalf("off, link: %d", code)
	}
	// Owner's card download: a PNG and an SVG, amount only when asked.
	if code, ct, _ := get(t, owner, site+"/visitors/1000/card?theme=light"); code != http.StatusOK || ct != "image/png" {
		t.Fatalf("card: %d %s", code, ct)
	}
	if code, _, svg := get(t, owner, site+"/revenue/1000/card?format=svg"); code != http.StatusOK || strings.Contains(svg, "1,000") {
		t.Fatalf("svg without amount: %d %s", code, svg)
	}
	if code, _, _ := get(t, client(), g.srv.URL+"/m/"+strings.Repeat("A", 43)); code != http.StatusNotFound {
		t.Fatalf("a made-up token: %d", code)
	}
}
