package api

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/trckable/trckable/server/internal/auth"
)

// The whole second step, the way a person walks it: turn it on, sign in with a
// code, sign in with a recovery code, then turn it off again.
func TestTwoStepSignIn(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	const pw = `"correct horse battery"`

	if _, out := do(t, c, "GET", g.srv.URL+"/api/v1/account/2fa", ""); out["enabled"] != false {
		t.Fatalf("fresh account: %v", out)
	}
	// The password is asked for again, so a borrowed session cannot add a
	// factor the owner does not hold.
	if code, _ := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/start", `{"password":"nope"}`, csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("start with a wrong password: %d", code)
	}
	code, out := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/start", `{"password":`+pw+`}`, csrf, "1")
	if code != 200 {
		t.Fatalf("start: %d %v", code, out)
	}
	secret := out["secret"].(string)
	if uri, _ := out["uri"].(string); uri == "" || secret == "" {
		t.Fatalf("nothing to scan: %v", out)
	}
	// Starting alone changes nothing: an abandoned setup must not lock anyone out.
	if _, out := do(t, c, "GET", g.srv.URL+"/api/v1/account/2fa", ""); out["enabled"] != false {
		t.Fatalf("enabled before any code was proven: %v", out)
	}
	if code, _ := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/enable", `{"code":"000000"}`, csrf, "1"); code != http.StatusBadRequest {
		t.Fatalf("enable with a wrong code: %d", code)
	}

	now, _ := auth.TOTPCode(secret, g.now)
	code, out = do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/enable", `{"code":"`+now[:3]+" "+now[3:]+`"}`, csrf, "1")
	if code != 200 {
		t.Fatalf("enable: %d %v", code, out)
	}
	var recovery []string
	b, _ := json.Marshal(out["recovery"])
	json.Unmarshal(b, &recovery)
	if len(recovery) != 8 {
		t.Fatalf("recovery codes: %v", recovery)
	}
	if _, out := do(t, c, "GET", g.srv.URL+"/api/v1/account/2fa", ""); out["enabled"] != true || out["recovery_left"] != 8.0 {
		t.Fatalf("after enabling: %v", out)
	}

	// Signing in now needs the code, and says so instead of claiming the
	// password was wrong.
	fresh := client()
	code, out = do(t, fresh, "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery"}`)
	if code != http.StatusUnauthorized || out["needs_code"] != true {
		t.Fatalf("password only: %d %v", code, out)
	}
	if code, _ := do(t, fresh, "GET", g.srv.URL+"/api/v1/me", ""); code != http.StatusUnauthorized {
		t.Fatal("a session was handed out before the second step")
	}
	if code, out := do(t, fresh, "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery","code":"111111"}`); code != http.StatusUnauthorized || out["needs_code"] != true {
		t.Fatalf("wrong code: %d %v", code, out)
	}
	now, _ = auth.TOTPCode(secret, g.now)
	if code, out := do(t, fresh, "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery","code":"`+now+`"}`); code != 200 {
		t.Fatalf("with the code: %d %v", code, out)
	}

	// A recovery code works once, and is then used up.
	lost := client()
	if code, _ := do(t, lost, "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery","code":"`+recovery[0]+`"}`); code != 200 {
		t.Fatalf("recovery code: %d", code)
	}
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery","code":"`+recovery[0]+`"}`); code != http.StatusUnauthorized {
		t.Fatal("a recovery code worked twice")
	}
	if _, out := do(t, c, "GET", g.srv.URL+"/api/v1/account/2fa", ""); out["recovery_left"] != 7.0 {
		t.Fatalf("recovery left: %v", out)
	}

	if code, _ := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/disable", `{"password":"nope"}`, csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("disable with a wrong password: %d", code)
	}
	if code, _ := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/disable", `{"password":`+pw+`}`, csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("disable: %d", code)
	}
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery"}`); code != 200 {
		t.Fatalf("password alone after turning it off: %d", code)
	}
}
