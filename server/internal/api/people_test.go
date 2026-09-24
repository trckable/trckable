package api

import (
	"net/http"
	"testing"
)

// A viewer reads this instance and changes nothing about it — except their own
// account, which stays theirs.
func TestViewerReadsButCannotChange(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)

	code, out := do(t, owner, "POST", g.srv.URL+"/api/v1/people", `{"email":"reader@site.com","role":"viewer"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("add viewer: %d %v", code, out)
	}
	password, _ := out["password"].(string)
	if password == "" {
		t.Fatal("no password was generated for the new account")
	}
	viewerID := out["person"].(map[string]any)["id"].(string)

	if code, _ := do(t, owner, "POST", g.srv.URL+"/api/v1/people", `{"email":"reader@site.com","role":"viewer"}`, csrf, "1"); code != http.StatusConflict {
		t.Fatalf("same email twice: %d", code)
	}

	viewer := client()
	if code, _ := do(t, viewer, "POST", g.srv.URL+"/api/v1/login", `{"email":"reader@site.com","password":"`+password+`"}`); code != 200 {
		t.Fatalf("viewer sign-in: %d", code)
	}
	if code, out := do(t, viewer, "GET", g.srv.URL+"/api/v1/me", ""); code != 200 || out["role"] != "viewer" {
		t.Fatalf("me: %d %v", code, out)
	}
	if code, out := do(t, viewer, "GET", g.srv.URL+"/api/v1/sites", ""); code != 200 || len(out["sites"].([]any)) != 1 {
		t.Fatalf("a viewer must still read the reports: %d %v", code, out)
	}
	for _, w := range [][3]string{
		{"POST", "/api/v1/sites", `{"domain":"evil.com"}`},
		{"DELETE", "/api/v1/sites/" + g.site, `{"domain":"site.com"}`},
		{"PATCH", "/api/v1/sites/" + g.site, `{"name":"mine"}`},
		{"POST", "/api/v1/keys", `{"name":"k"}`},
		{"POST", "/api/v1/people", `{"email":"x@y.z"}`},
		{"DELETE", "/api/v1/people/" + viewerID, ``},
	} {
		if code, _ := do(t, viewer, w[0], g.srv.URL+w[1], w[2], csrf, "1"); code != http.StatusForbidden {
			t.Errorf("viewer %s %s: %d, want 403", w[0], w[1], code)
		}
	}
	// Their own account is still theirs.
	if code, _ := do(t, viewer, "PATCH", g.srv.URL+"/api/v1/account", `{"name":"Reader"}`, csrf, "1"); code != 200 {
		t.Errorf("a viewer must be able to set their own name: %d", code)
	}
	if code, _ := do(t, viewer, "POST", g.srv.URL+"/api/v1/account/password", `{"current":"`+password+`","password":"a much longer password"}`, csrf, "1"); code != http.StatusNoContent {
		t.Errorf("a viewer must be able to change their own password: %d", code)
	}
	if code, _ := do(t, viewer, "GET", g.srv.URL+"/api/v1/people", ""); code != http.StatusForbidden {
		t.Error("a viewer saw the list of people")
	}
}

// The instance always keeps someone who can administer it.
func TestTheLastOwnerStays(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	list := func() []any {
		_, out := do(t, c, "GET", g.srv.URL+"/api/v1/people", "")
		return out["people"].([]any)
	}
	me := list()[0].(map[string]any)
	if me["role"] != "owner" {
		t.Fatalf("the first account is %v", me["role"])
	}
	if code, _ := do(t, c, "PATCH", g.srv.URL+"/api/v1/people/"+me["id"].(string), `{"role":"viewer"}`, csrf, "1"); code != http.StatusConflict {
		t.Fatalf("demoting the only owner: %d", code)
	}
	if code, _ := do(t, c, "DELETE", g.srv.URL+"/api/v1/people/"+me["id"].(string), "", csrf, "1"); code != http.StatusBadRequest {
		t.Fatalf("removing yourself: %d", code)
	}

	// With a second owner, either may step down.
	code, out := do(t, c, "POST", g.srv.URL+"/api/v1/people", `{"email":"two@site.com","role":"owner"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("add owner: %d %v", code, out)
	}
	if len(list()) != 2 {
		t.Fatal("the new owner is missing from the list")
	}
	if code, _ := do(t, c, "PATCH", g.srv.URL+"/api/v1/people/"+me["id"].(string), `{"role":"viewer"}`, csrf, "1"); code != 200 {
		t.Fatalf("stepping down beside another owner: %d", code)
	}
	// And the moment they step down, this list is no longer theirs to read.
	if code, _ := do(t, c, "GET", g.srv.URL+"/api/v1/people", ""); code != http.StatusForbidden {
		t.Fatalf("a former owner still sees the people: %d", code)
	}
}
