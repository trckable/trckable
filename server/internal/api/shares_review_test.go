package api

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// A preview is not one of the site's links: nothing makes it last, move or go.
func TestSharePreviewCannotBeEditedReaddressedOrRevoked(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	_, pv := do(t, c, "PUT", base+"/shares/preview", `{"name":"Draft"}`, csrf, "1")
	token := pv["path"].(string)[3:]
	var id string
	if err := g.ctl.DB.QueryRow(`SELECT id FROM site_shares WHERE preview = 1`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	for _, r := range [][3]string{
		{"PATCH", base + "/shares/" + id, `{"days":0}`},
		{"PATCH", base + "/shares/" + id, `{"name":"x"}`},
		{"POST", base + "/shares/" + id + "/address", ``},
		{"DELETE", base + "/shares/" + id, ``},
	} {
		if code, _ := do(t, c, r[0], r[1], r[2], csrf, "1"); code != http.StatusNotFound {
			t.Errorf("%s %s: %d, want 404", r[0], r[1][len(base):], code)
		}
	}
	var exp int64
	var name string
	if err := g.ctl.DB.QueryRow(`SELECT expires_at, name FROM site_shares WHERE id = ?`, id).Scan(&exp, &name); err != nil || exp == 0 || name != "Draft" {
		t.Errorf("the preview changed: %d %q %v", exp, name, err)
	}
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+token+`"}`); code != 200 {
		t.Errorf("the preview stopped opening: %d", code)
	}
}

// A new password ends the sessions of the old one, even for an opening that was checked just before.
func TestShareSessionNeedsTheCurrentPassword(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/shares"
	_, made := do(t, c, "POST", base, `{"name":"x","password":"first password 1"}`, csrf, "1")
	id := made["share"].(map[string]any)["id"].(string)
	url := made["url"].(string)
	token := url[len(url)-26:]
	sh, err := g.ctl.OpenShare(t.Context(), token, "first password 1", g.now)
	if err != nil {
		t.Fatal(err)
	}
	if code, _ := do(t, c, "PATCH", base+"/"+id, `{"password":"second password 2"}`, csrf, "1"); code != 200 {
		t.Fatal("patch")
	}
	// The opening checked against the first password races the change: it gets no session.
	if _, err := g.ctl.StartShareSession(t.Context(), sh.ID, token, sh.PassHash, g.now); err == nil {
		t.Error("a session started on a password that was changed")
	}
}

// With pages off, a goal that names a page goes with the pages.
func TestShareHiddenPagesHidePageGoals(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	if code, out := do(t, c, "PUT", base+"/config", `{"page_goals":[{"name":"Saw pricing","path":"/pricing"}]}`, csrf, "1"); code != 200 {
		t.Fatalf("config: %d %v", code, out)
	}
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 1, Visitor: 4, Path: "/pricing", TS: g.now.Add(-time.Hour).UnixMilli()})
	g.waitApplied(t, 1)
	open := func(body string) *http.Client {
		_, out := do(t, c, "POST", base+"/shares", body, csrf, "1")
		url := out["url"].(string)
		anon := client()
		do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+url[len(url)-26:]+`"}`)
		return anon
	}
	goals := func(a *http.Client) string {
		_, rep := do(t, a, "GET", g.srv.URL+"/api/v1/share/report?from=2026-09-22&to=2026-09-22", "")
		return strings.ToLower(fmt.Sprint(rep["current"].(map[string]any)["goals"]))
	}
	if !strings.Contains(goals(open(`{"name":"all"}`)), "saw pricing") {
		t.Fatal("a link with every section lost its page goal")
	}
	hidden := open(`{"name":"nopages","sections":["sources"]}`)
	if strings.Contains(goals(hidden), "saw pricing") {
		t.Error("a page goal named the page on a link with pages off")
	}
	if code, _ := do(t, hidden, "GET", g.srv.URL+"/api/v1/share/report?from=2026-09-22&to=2026-09-22&f=goal:Saw%20pricing", ""); code != http.StatusForbidden {
		t.Errorf("a page goal filter on a link with pages off: %d", code)
	}
}

// A link that has ended stays ended: a new end date does not bring it back.
func TestShareEndedLinkCannotBeRevived(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/shares"
	_, made := do(t, c, "POST", base, `{"name":"x","days":1}`, csrf, "1")
	id := made["share"].(map[string]any)["id"].(string)
	g.advance(48 * time.Hour)
	for _, b := range []string{`{"days":30}`, `{"days":0}`} {
		if code, out := do(t, c, "PATCH", base+"/"+id, b, csrf, "1"); code != http.StatusConflict {
			t.Errorf("PATCH %s on an ended link: %d %v, want 409", b, code, out)
		}
	}
	if code, _ := do(t, c, "PATCH", base+"/"+id, `{"name":"renamed"}`, csrf, "1"); code != 200 {
		t.Errorf("an ended link can still be renamed: %d", code)
	}
}
