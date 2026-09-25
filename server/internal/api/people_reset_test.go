package api

import (
	"fmt"
	"net/http"
	"testing"
)

// A password someone else chose is replaced at the first sign-in, and an
// owner can hand a forgetful person a new one-time password.
func TestOneTimePasswordsAndReset(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	code, out := do(t, owner, "POST", g.srv.URL+"/api/v1/people", `{"email":"ada@site.com","role":"viewer"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("add: %d %v", code, out)
	}
	first := out["password"].(string)
	id := out["person"].(map[string]any)["id"].(string)

	ada := client()
	login := func(c *http.Client, pw string) int {
		code, _ := do(t, c, "POST", g.srv.URL+"/api/v1/login", fmt.Sprintf(`{"email":"ada@site.com","password":%q}`, pw))
		return code
	}
	if code := login(ada, first); code != http.StatusOK {
		t.Fatalf("first sign-in: %d", code)
	}
	if _, me := do(t, ada, "GET", g.srv.URL+"/api/v1/me", ""); me["must_change"] != true {
		t.Fatalf("a new person must choose a password: %v", me)
	}
	if code, out := do(t, ada, "POST", g.srv.URL+"/api/v1/account/password", fmt.Sprintf(`{"current":%q,"password":"ada's own long password"}`, first), csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("change: %d %v", code, out)
	}
	if _, me := do(t, ada, "GET", g.srv.URL+"/api/v1/me", ""); me["must_change"] != false {
		t.Fatalf("after choosing one: %v", me)
	}

	// Ada forgets it; an owner resets it, with their own password.
	if code, _ := do(t, owner, "POST", g.srv.URL+"/api/v1/people/"+id+"/password", `{"password":"not mine"}`, csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("a reset without the owner's own password: %d", code)
	}
	code, out = do(t, owner, "POST", g.srv.URL+"/api/v1/people/"+id+"/password", `{"password":"correct horse battery"}`, csrf, "1")
	if code != http.StatusOK || out["password"] == "" {
		t.Fatalf("reset: %d %v", code, out)
	}
	if code := login(client(), "ada's own long password"); code == http.StatusOK {
		t.Fatal("the old password still works after a reset")
	}
	again := client()
	if code := login(again, out["password"].(string)); code != http.StatusOK {
		t.Fatalf("sign-in with the reset password: %d", code)
	}
	if _, me := do(t, again, "GET", g.srv.URL+"/api/v1/me", ""); me["must_change"] != true {
		t.Fatalf("after a reset: %v", me)
	}
	// Until she chooses her own, the one-time password opens nothing else:
	// whoever saw it must not keep the account.
	if code, _ := do(t, again, "GET", g.srv.URL+"/api/v1/sites", ""); code != http.StatusForbidden {
		t.Fatalf("reading sites with a one-time password: %d", code)
	}
	if code, _ := do(t, again, "POST", g.srv.URL+"/api/v1/keys", `{"name":"mine now"}`, csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("making an API key with a one-time password: %d", code)
	}
	// An owner's password is not another owner's to reset.
	do(t, owner, "PATCH", g.srv.URL+"/api/v1/people/"+id, `{"role":"owner"}`, csrf, "1")
	if code, _ := do(t, owner, "POST", g.srv.URL+"/api/v1/people/"+id+"/password", `{"password":"correct horse battery"}`, csrf, "1"); code != http.StatusConflict {
		t.Fatalf("resetting another owner: %d", code)
	}
	// Owners change their own password in their account, with the current one.
	_, me := do(t, owner, "GET", g.srv.URL+"/api/v1/people", "")
	ownID := me["people"].([]any)[0].(map[string]any)["id"].(string)
	if code, _ := do(t, owner, "POST", g.srv.URL+"/api/v1/people/"+ownID+"/password", `{"password":"correct horse battery"}`, csrf, "1"); code != http.StatusBadRequest {
		t.Fatalf("resetting your own password: %d, want 400", code)
	}
	// A viewer cannot reset anyone's.
	if code, _ := do(t, again, "POST", g.srv.URL+"/api/v1/people/"+ownID+"/password", "", csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("a viewer resetting: %d, want 403", code)
	}
}
