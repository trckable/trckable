package api

import (
	"net/http"
	"strings"
	"testing"
)

// A link can be changed after it is made: by whoever may make one, and only
// what the owner sends changes.
func TestShareCanBeEdited(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/shares"
	_, made := do(t, c, "POST", base, `{"name":"Board","revenue":true}`, csrf, "1")
	url := made["url"].(string)
	token := url[len(url)-26:]
	id := made["share"].(map[string]any)["id"].(string)
	patch := func(body string) (int, map[string]any) {
		return do(t, c, "PATCH", base+"/"+id, body, csrf, "1")
	}
	row := func() map[string]any {
		_, out := do(t, c, "GET", base, "")
		return out["shares"].([]any)[0].(map[string]any)
	}

	// Name and notes, and nothing else moves.
	code, out := patch(`{"name":"Investors","notes":true}`)
	if code != http.StatusOK || out["share"].(map[string]any)["name"] != "Investors" {
		t.Fatalf("rename: %d %v", code, out)
	}
	if r := row(); r["notes"] != true || r["revenue"] != true || r["has_password"] == true || r["expires_at"] != nil {
		t.Fatalf("a rename changed something else: %v", r)
	}

	// An end date, then none again.
	if code, _ := patch(`{"days":7}`); code != http.StatusOK || row()["expires_at"] == nil {
		t.Fatalf("end date: %d %v", code, row())
	}
	if code, _ := patch(`{"days":0}`); code != http.StatusOK || row()["expires_at"] != nil {
		t.Fatalf("no end date: %d %v", code, row())
	}

	// Embedding, then not.
	if code, _ := patch(`{"embed_origins":["https://example.com/"]}`); code != http.StatusOK {
		t.Fatal("embed")
	}
	if o := row()["embed_origins"].([]any); len(o) != 1 || o[0] != "https://example.com" {
		t.Fatalf("embed origins: %v", o)
	}
	if code, _ := patch(`{"embed_origins":[]}`); code != http.StatusOK || row()["embed_origins"] != nil {
		t.Fatalf("embed removed: %v", row())
	}

	// A password: set, and the reader who opened it before is let out.
	anon := client()
	if code, _ := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+token+`"}`); code != 200 {
		t.Fatal("open before the password")
	}
	if code, _ := patch(`{"password":"a fresh password 1"}`); code != http.StatusOK || row()["has_password"] != true {
		t.Fatalf("set password: %v", row())
	}
	if code, _ := do(t, anon, "GET", g.srv.URL+"/api/v1/share/me", ""); code != http.StatusUnauthorized {
		t.Error("a reader who opened the link before it had a password kept reading")
	}
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+token+`"}`); code != http.StatusUnauthorized {
		t.Error("the link opened without its new password")
	}
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+token+`","password":"a fresh password 1"}`); code != 200 {
		t.Error("the new password was refused")
	}
	// Removing it: "" and only "".
	if code, _ := patch(`{"password":"   "}`); code != http.StatusBadRequest || row()["has_password"] != true {
		t.Fatalf("a password of spaces must not remove the password: %v", row())
	}
	if code, _ := patch(`{"password":""}`); code != http.StatusOK || row()["has_password"] == true {
		t.Fatalf("remove password: %v", row())
	}
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+token+`"}`); code != 200 {
		t.Error("a link without a password still asked for one")
	}
}

func TestShareEditIsChecked(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/shares"
	_, made := do(t, c, "POST", base, `{"name":"Board"}`, csrf, "1")
	id := made["share"].(map[string]any)["id"].(string)

	for body, want := range map[string]int{
		`{}`: http.StatusBadRequest,
		`{"name":"` + strings.Repeat("x", 61) + `"}`: http.StatusBadRequest,
		`{"days":3651}`:                            http.StatusBadRequest,
		`{"days":-1}`:                              http.StatusBadRequest,
		`{"password":"short"}`:                     http.StatusBadRequest,
		`{"embed_origins":["not a site"]}`:         http.StatusBadRequest,
		`{"embed_origins":["https://a.com/path"]}`: http.StatusBadRequest,
		`{"embed_origins":["https://a.com","https://b.com","https://c.com","https://d.com","https://e.com","https://f.com"]}`: http.StatusBadRequest,
		`not json`: http.StatusBadRequest,
	} {
		if code, out := do(t, c, "PATCH", base+"/"+id, body, csrf, "1"); code != want {
			t.Errorf("PATCH %.40s: %d %v, want %d", body, code, out, want)
		}
	}
	// Nothing above got through.
	_, out := do(t, c, "GET", base, "")
	if r := out["shares"].([]any)[0].(map[string]any); r["name"] != "Board" || r["has_password"] == true || r["expires_at"] != nil {
		t.Errorf("a refused edit changed the link: %v", r)
	}
	if code, _ := do(t, c, "PATCH", base+"/shr_missing", `{"name":"x"}`, csrf, "1"); code != http.StatusNotFound {
		t.Errorf("an unknown link: %d", code)
	}
}

// Whoever may not make a link may not change one, and nobody signed out may.
func TestShareEditNeedsTheRightRole(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/shares"
	_, made := do(t, owner, "POST", base, `{"name":"Board"}`, csrf, "1")
	id := made["share"].(map[string]any)["id"].(string)

	_, added := do(t, owner, "POST", g.srv.URL+"/api/v1/people", `{"email":"reader@site.com","role":"viewer"}`, csrf, "1")
	viewer := signInFirst(t, g, "reader@site.com", added["password"].(string))
	for _, who := range []struct {
		name string
		c    *http.Client
		want int
	}{{"viewer", viewer, http.StatusForbidden}, {"signed out", client(), http.StatusUnauthorized}} {
		if code, _ := do(t, who.c, "PATCH", base+"/"+id, `{"name":"mine","password":"a viewer chose this"}`, csrf, "1"); code != who.want {
			t.Errorf("%s: PATCH %d, want %d", who.name, code, who.want)
		}
	}
	_, out := do(t, owner, "GET", base, "")
	if r := out["shares"].([]any)[0].(map[string]any); r["name"] != "Board" || r["has_password"] == true {
		t.Errorf("a refused edit changed the link: %v", r)
	}
}
