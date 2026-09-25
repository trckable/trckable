package api

import (
	"context"
	"net/http"
	"testing"
)

// An operator creates a customer's account, the owner signs in through a
// one-time link, and the account is limited, made read-only, suspended and
// deleted, each doing exactly what it says.
func TestOperatorAccounts(t *testing.T) {
	g := newRig(t)
	g.setup(t, client()) // the instance's own account, which the operator never sees
	ctx := context.Background()
	url := g.srv.URL + "/_trckable/accounts"
	if code, _ := do(t, client(), "GET", url, ""); code != http.StatusNotFound {
		t.Fatalf("without an operator token the endpoints must not exist: %d", code)
	}
	g.api.Operator = "tkb_op_test_0123456789"
	op := []string{"Authorization", "Bearer tkb_op_test_0123456789"}
	if code, _ := do(t, client(), "GET", url, "", "Authorization", "Bearer nope"); code != http.StatusUnauthorized {
		t.Fatalf("wrong token: %d", code)
	}

	code, out := do(t, client(), "POST", url, `{"email":"Them@Company.com"}`, op...)
	if code != http.StatusCreated {
		t.Fatalf("create: %d %v", code, out)
	}
	acc := out["account"].(map[string]any)["id"].(string)
	if code, _ := do(t, client(), "POST", url, `{"email":"them@company.com"}`, op...); code != http.StatusConflict {
		t.Fatalf("same email twice: %d", code)
	}
	if code, out := do(t, client(), "GET", url, "", op...); code != http.StatusOK || len(out["accounts"].([]any)) != 1 {
		t.Fatalf("list (the default account is never in it): %d %v", code, out)
	}
	if code, out := do(t, client(), "PUT", url+"/"+acc+"/limits", `{"max_members":10}`, op...); code != http.StatusOK || out["max_members"] != float64(10) {
		t.Fatalf("limits: %d %v", code, out)
	}

	// The owner has no password: they come in through a one-time link.
	site, err := g.ctl.CreateSite(ctx, acc, "company.com", "")
	if err != nil {
		t.Fatal(err)
	}
	signIn := func() *http.Client {
		code, out := do(t, client(), "POST", g.srv.URL+"/_trckable/signin", `{"email":"them@company.com"}`, op...)
		if code != http.StatusOK {
			t.Fatalf("sign-in link: %d %v", code, out)
		}
		b := client()
		res, err := b.Get(g.srv.URL + out["url"].(string))
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		return b
	}
	owner := signIn()
	if code, _ := do(t, owner, "GET", g.srv.URL+"/api/v1/sites", ""); code != http.StatusOK {
		t.Fatalf("the owner reads their sites: %d", code)
	}

	// Read-only: looking works, changing does not.
	if code, _ := do(t, client(), "PUT", url+"/"+acc+"/state", `{"state":"read_only"}`, op...); code != http.StatusOK {
		t.Fatalf("read-only: %d", code)
	}
	if code, _ := do(t, owner, "GET", g.srv.URL+"/api/v1/sites", ""); code != http.StatusOK {
		t.Fatalf("read-only still reads: %d", code)
	}
	if code, _ := do(t, owner, "POST", g.srv.URL+"/api/v1/sites", `{"domain":"another.com"}`, "X-Trckable-Request", "1"); code != http.StatusForbidden {
		t.Fatalf("read-only changed something: %d", code)
	}

	// Suspended: signed out, no way back in, and the site takes no events.
	if code, _ := do(t, client(), "PUT", url+"/"+acc+"/state", `{"state":"suspended"}`, op...); code != http.StatusOK {
		t.Fatalf("suspend: %d", code)
	}
	if code, _ := do(t, owner, "GET", g.srv.URL+"/api/v1/sites", ""); code == http.StatusOK {
		t.Fatal("a session outlived the suspension")
	}
	if code, _ := do(t, signIn(), "GET", g.srv.URL+"/api/v1/sites", ""); code != http.StatusForbidden {
		t.Fatalf("a suspended account let someone in: %d", code)
	}
	if _, ok := g.ctl.Site(site); ok {
		t.Fatal("a suspended account's site still takes events")
	}
	if code, _ := do(t, client(), "PUT", url+"/"+acc+"/state", `{"state":"active"}`, op...); code != http.StatusOK {
		t.Fatal("reactivate")
	}
	if _, ok := g.ctl.Site(site); !ok {
		t.Fatal("reactivated, but the site still takes no events")
	}

	// Deleting: never the default account; the rest takes everything with it.
	if code, _ := do(t, client(), "DELETE", url+"/acc_default", "", op...); code != http.StatusBadRequest {
		t.Fatalf("deleted the default account: %d", code)
	}
	code, out = do(t, client(), "DELETE", url+"/"+acc, "", op...)
	if code != http.StatusOK || out["sites"] != float64(1) {
		t.Fatalf("delete: %d %v", code, out)
	}
	if code, out := do(t, client(), "GET", url, "", op...); code != http.StatusOK || len(out["accounts"].([]any)) != 0 {
		t.Fatalf("still listed: %v", out)
	}
	if _, err := g.ctl.SiteAccount(ctx, site); err == nil {
		t.Fatal("the site outlived its account")
	}
	if code, _ := do(t, client(), "GET", url+"/"+acc, "", op...); code != http.StatusNotFound {
		t.Fatalf("a deleted account answers: %d", code)
	}
}

// On a managed instance nobody gets in around the hosting provider: no
// setup, no password sign-in, no password or second step to set, and people
// added to a team get no password at all.
func TestManagedInstance(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner) // setup signs its browser in
	g.api.Managed = "https://cloud.example.com/login"

	if code, out := do(t, client(), "GET", g.srv.URL+"/api/v1/setup", ""); code != http.StatusOK || out["needs_setup"] != false || out["managed"] != "https://cloud.example.com/login" {
		t.Fatalf("setup status: %d %v", code, out)
	}
	for _, c := range []struct{ method, path, body string }{
		{"POST", "/api/v1/setup", `{"token":"x","email":"a@b.com","password":"a long enough password"}`},
		{"POST", "/api/v1/login", `{"email":"me@site.com","password":"correct horse battery"}`},
	} {
		if code, _ := do(t, client(), c.method, g.srv.URL+c.path, c.body, "X-Trckable-Request", "1"); code != http.StatusNotFound {
			t.Errorf("%s %s on a managed instance: %d", c.method, c.path, code)
		}
	}
	for _, path := range []string{"/api/v1/account/password", "/api/v1/account/2fa/start", "/api/v1/account/2fa/enable"} {
		if code, _ := do(t, owner, "POST", g.srv.URL+path, `{}`, "X-Trckable-Request", "1"); code != http.StatusNotFound {
			t.Errorf("POST %s on a managed instance: %d", path, code)
		}
	}
	code, out := do(t, owner, "POST", g.srv.URL+"/api/v1/people", `{"email":"new@site.com","role":"viewer","password":"chosen by the inviter"}`, "X-Trckable-Request", "1")
	if code != http.StatusCreated || out["password"] != "" || out["signin"] != "https://cloud.example.com/login" {
		t.Fatalf("invite on a managed instance: %d %v", code, out)
	}
	g.api.Managed = ""
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"new@site.com","password":"chosen by the inviter"}`, "X-Trckable-Request", "1"); code == http.StatusOK {
		t.Fatal("a password given to a managed invite works")
	}
}

func TestOperatorHealth(t *testing.T) {
	g := newRig(t)
	g.api.HealthOf = func(context.Context) Health { return Health{Version: "test", Analytics: "ready"} }
	url := g.srv.URL + "/_trckable/health"
	if code, _ := do(t, client(), "GET", url, ""); code != http.StatusNotFound {
		t.Fatalf("without an operator token it must not exist: %d", code)
	}
	g.api.Operator = "tkb_op_test_0123456789"
	if code, _ := do(t, client(), "GET", url, "", "Authorization", "Bearer nope"); code != http.StatusUnauthorized {
		t.Fatalf("wrong token: %d", code)
	}
	code, out := do(t, client(), "GET", url, "", "Authorization", "Bearer tkb_op_test_0123456789")
	if code != http.StatusOK || out["version"] != "test" || out["memory_bytes"].(float64) <= 0 {
		t.Fatalf("health: %d %v", code, out)
	}
}
