package api

import (
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// A widget shows only its numbers, runs nothing, and goes away when it is off.
func TestWidgets(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	for i, c := range []string{"DE", "DE", "FR"} {
		g.event(t, event.Event{Kind: event.KindPageview, EventID: uint64(i + 1), TS: g.now.Add(-time.Duration(i) * time.Minute).UnixMilli(), Visitor: uint64(10 + i), Path: "/", Country: c})
	}
	g.waitApplied(t, 3)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/widgets"

	if code, _ := do(t, owner, "POST", base, `{"kind":"marquee"}`, csrf, "1"); code != http.StatusBadRequest {
		t.Fatalf("an unknown design must be refused: %d", code)
	}
	if code, _ := do(t, owner, "POST", base, `{"kind":"live","accent":"red;x"}`, csrf, "1"); code != http.StatusBadRequest {
		t.Fatalf("a colour that is not #rrggbb must be refused: %d", code)
	}
	code, out := do(t, owner, "POST", base, `{"kind":"live","theme":"dark","radius":16,"brand":true}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("create: %d %v", code, out)
	}
	id := out["id"].(string)

	page := func() (int, http.Header, string) {
		res, err := http.Get(g.srv.URL + "/w/" + id)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		return res.StatusCode, res.Header, string(b)
	}
	st, h, body := page()
	if st != http.StatusOK {
		t.Fatalf("public page: %d", st)
	}
	if csp := h.Get("Content-Security-Policy"); !strings.Contains(csp, "default-src 'none'") || strings.Contains(csp, "script-src") {
		t.Fatalf("the page must run nothing: %q", csp)
	}
	if h.Get("Set-Cookie") != "" || strings.Contains(body, "<script") {
		t.Fatal("a widget sets no cookie and carries no script")
	}
	if !strings.Contains(body, ">3<") || !strings.Contains(body, "Germany") || !strings.Contains(body, "France") {
		t.Fatalf("three visitors from Germany and France: %s", body)
	}

	if code, _ := do(t, owner, "PUT", base+"/"+id, `{"kind":"live","theme":"dark","on":false}`, csrf, "1"); code != http.StatusOK {
		t.Fatalf("turn off: %d", code)
	}
	if st, _, _ := page(); st != http.StatusNotFound {
		t.Fatalf("a widget that is off is not found: %d", st)
	}
	if res, _ := http.Get(g.srv.URL + "/w/w_doesnotexist"); res.StatusCode != http.StatusNotFound {
		t.Fatalf("an unknown id: %d", res.StatusCode)
	}
	if code, _ := do(t, owner, "DELETE", base+"/"+id, "", csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("delete: %d", code)
	}

	// A viewer reads the list and changes nothing.
	_, made := do(t, owner, "POST", g.srv.URL+"/api/v1/people", `{"email":"reader@site.com","role":"viewer"}`, csrf, "1")
	viewer := client()
	do(t, viewer, "POST", g.srv.URL+"/api/v1/login", `{"email":"reader@site.com","password":"`+made["password"].(string)+`"}`)
	if code, _ := do(t, viewer, "POST", base, `{"kind":"badge"}`, csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("a viewer must not make a widget: %d", code)
	}
}
