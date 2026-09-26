package api

import (
	"fmt"
	"net/http"
	"strings"
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

	viewer := signInFirst(t, g, "reader@site.com", password)
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
	if code, _ := do(t, viewer, "POST", g.srv.URL+"/api/v1/account/password", `{"current":"a long password of their own","password":"a much longer password"}`, csrf, "1"); code != http.StatusNoContent {
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

// On a shared server, adding an address that is someone in another account
// answers exactly as adding a new one would, and lists them the same way:
// one customer learns nothing about another's people. They join once the
// address is free.
func TestAddingAnAddressUsedElsewhereSaysNothing(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	g.api.Operator = "tkb_op_test_0123456789"
	g.api.Managed = "https://cloud.example.com/login"
	op := []string{"Authorization", "Bearer tkb_op_test_0123456789"}
	account := func(email string) string {
		code, out := do(t, client(), "POST", g.srv.URL+"/_trckable/accounts", `{"email":"`+email+`"}`, op...)
		if code != http.StatusCreated {
			t.Fatalf("create %s: %d %v", email, code, out)
		}
		return out["account"].(map[string]any)["id"].(string)
	}
	signIn := func(email string) *http.Client {
		code, out := do(t, client(), "POST", g.srv.URL+"/_trckable/signin", `{"email":"`+email+`"}`, op...)
		if code != http.StatusOK {
			t.Fatalf("sign-in link for %s: %d %v", email, code, out)
		}
		b := client()
		res, err := b.Get(g.srv.URL + out["url"].(string))
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		return b
	}
	other := account("them@elsewhere.com")
	account("boss@mine.com")
	boss := signIn("boss@mine.com")

	// The same status and the same body, but for the id, address and time.
	add := func(email string) (int, map[string]any) {
		code, out := do(t, boss, "POST", g.srv.URL+"/api/v1/people", `{"email":"`+email+`","role":"viewer"}`, csrf, "1")
		p := out["person"].(map[string]any)
		if p["email"] != email {
			t.Fatalf("person %v", p)
		}
		delete(p, "id")
		delete(p, "email")
		delete(p, "created_at")
		return code, out
	}
	codeNew, outNew := add("new@nowhere.com")
	codeUsed, outUsed := add("them@elsewhere.com")
	if a, b := fmt.Sprint(codeNew, outNew), fmt.Sprint(codeUsed, outUsed); codeNew != http.StatusCreated || a != b {
		t.Fatalf("answered differently:\n new:  %s\n used: %s", a, b)
	}
	_, out := do(t, boss, "GET", g.srv.URL+"/api/v1/people", "")
	list := out["people"].([]any)
	if len(list) != 3 {
		t.Fatalf("list: %v", list)
	}
	var used string
	shape := map[string]string{}
	for _, x := range list[1:] {
		p := x.(map[string]any)
		if p["email"] == "them@elsewhere.com" {
			used = p["id"].(string)
		}
		delete(p, "id")
		delete(p, "created_at")
		shape[p["email"].(string)] = strings.Replace(fmt.Sprint(p), p["email"].(string), "", 1)
	}
	if shape["new@nowhere.com"] != shape["them@elsewhere.com"] {
		t.Fatalf("listed differently: %v", shape)
	}
	// Twice is refused the same way for both: that is this account's own list.
	for _, e := range []string{"new@nowhere.com", "them@elsewhere.com"} {
		code, out := do(t, boss, "POST", g.srv.URL+"/api/v1/people", `{"email":"`+e+`","role":"viewer"}`, csrf, "1")
		if code != http.StatusConflict || out["error"] != "that person is already on this account" {
			t.Fatalf("%s twice: %d %v", e, code, out)
		}
	}
	// Acting on them works as on anyone added.
	if code, _ := do(t, boss, "PATCH", g.srv.URL+"/api/v1/people/"+used, `{"role":"owner"}`, csrf, "1"); code != http.StatusOK {
		t.Fatalf("role: %d", code)
	}

	// Until the address is free they still land in their own account; then
	// in this one, as added.
	if _, out := do(t, signIn("them@elsewhere.com"), "GET", g.srv.URL+"/api/v1/me", ""); out["role"] != "owner" {
		t.Fatalf("them before: %v", out)
	}
	if code, _ := do(t, client(), "DELETE", g.srv.URL+"/_trckable/accounts/"+other, "", op...); code != http.StatusOK && code != http.StatusNoContent {
		t.Fatalf("delete their account: %d", code)
	}
	them := signIn("them@elsewhere.com")
	if code, out := do(t, them, "GET", g.srv.URL+"/api/v1/people", ""); code != http.StatusOK || len(out["people"].([]any)) != 3 {
		t.Fatalf("them after, as an owner of this account: %d %v", code, out)
	}
}
