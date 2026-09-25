package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"

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
	if code, _ := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/enable", `{"password":`+pw+`,"code":"000000"}`, csrf, "1"); code != http.StatusBadRequest {
		t.Fatalf("enable with a wrong code: %d", code)
	}

	now, _ := auth.TOTPCode(secret, g.now)
	// The password again to finish, so a session alone cannot add a phone.
	if code, _ := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/enable", `{"code":"`+now+`"}`, csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("enable without the password: %d", code)
	}
	code, out = do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/enable", `{"password":`+pw+`,"code":"`+now[:3]+" "+now[3:]+`"}`, csrf, "1")
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
	// The code that turned two-step on has done its job: it does not sign in.
	enabling := now
	if code, _ := do(t, fresh, "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery","code":"`+enabling+`"}`); code != http.StatusUnauthorized {
		t.Fatalf("the enabling code signed in: %d", code)
	}
	// A minute later: the new code signs in once, and only once.
	later := g.advance(time.Minute)
	now, _ = auth.TOTPCode(secret, later)
	if code, out := do(t, fresh, "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery","code":"`+now+`"}`); code != 200 {
		t.Fatalf("with the code: %d %v", code, out)
	}
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery","code":"`+now+`"}`); code != http.StatusUnauthorized {
		t.Fatal("the same code signed in twice (seen over a shoulder, or replayed)")
	}
	// Nor does the code from the step before, though it is still in the window.
	before, _ := auth.TOTPCode(secret, later.Add(-auth.TOTPStep))
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery","code":"`+before+`"}`); code != http.StatusUnauthorized {
		t.Fatal("an older code signed in after a newer one")
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

	// (A new ten-minute window: the codes above spent this person's tries.)
	g.advance(11 * time.Minute)
	// While it is on, the password alone (a borrowed session, a password read
	// over a shoulder) can neither replace the phone nor remove it.
	if code, out := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/start", `{"password":`+pw+`}`, csrf, "1"); code != http.StatusForbidden || out["needs_code"] != true {
		t.Fatalf("start while on, password only: %d %v", code, out)
	}
	if code, _ := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/start", `{"password":`+pw+`,"code":"000000"}`, csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("start while on, wrong code: %d", code)
	}
	// With a code, a new phone can be set up; given up half-way, the old phone
	// still works and two-step stays on.
	now2 := g.advance(time.Minute)
	c2, _ := auth.TOTPCode(secret, now2)
	if code, out := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/start", `{"password":`+pw+`,"code":"`+c2+`"}`, csrf, "1"); code != 200 || out["secret"] == secret {
		t.Fatalf("start a new phone with a code: %d %v", code, out)
	}
	if _, out := do(t, c, "GET", g.srv.URL+"/api/v1/account/2fa", ""); out["enabled"] != true {
		t.Fatalf("an abandoned new setup turned two-step off: %v", out)
	}
	now3 := g.advance(time.Minute)
	c3, _ := auth.TOTPCode(secret, now3)
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery","code":"`+c3+`"}`); code != 200 {
		t.Fatalf("the old phone after an abandoned new setup: %d", code)
	}

	if code, _ := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/disable", `{"password":"nope"}`, csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("disable with a wrong password: %d", code)
	}
	if code, out := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/disable", `{"password":`+pw+`}`, csrf, "1"); code != http.StatusForbidden || out["needs_code"] != true {
		t.Fatalf("disable with the password alone: %d %v", code, out)
	}
	if code, _ := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/disable", `{"password":`+pw+`,"code":"`+recovery[1]+`"}`, csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("disable with a recovery code: %d", code)
	}
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery"}`); code != 200 {
		t.Fatalf("password alone after turning it off: %d", code)
	}
}

// The races the security review found: several enables with one code, and
// one recovery code spent by several requests at once.
func TestTwoStepRaces(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	const pw = `"correct horse battery"`
	_, out := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/start", `{"password":`+pw+`}`, csrf, "1")
	secret := out["secret"].(string)
	now, _ := auth.TOTPCode(secret, g.now)

	// Eight enables at once: exactly one wins, and the secret is the real one.
	var wg sync.WaitGroup
	var ok atomic.Int32
	codes := make([][]string, 8)
	for i := range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if code, out := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/enable", `{"password":`+pw+`,"code":"`+now+`"}`, csrf, "1"); code == 200 {
				ok.Add(1)
				b, _ := json.Marshal(out["recovery"])
				json.Unmarshal(b, &codes[i])
			}
		}()
	}
	wg.Wait()
	if ok.Load() != 1 {
		t.Fatalf("%d enables succeeded with one code, want exactly 1", ok.Load())
	}
	// An empty secret's code never signs in.
	later := g.advance(time.Minute)
	empty, _ := auth.TOTPCode("", later)
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery","code":"`+empty+`"}`); code == 200 {
		t.Fatal("the empty-secret code signed in")
	}
	real, _ := auth.TOTPCode(secret, later)
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery","code":"`+real+`"}`); code != 200 {
		t.Fatalf("the real phone's code: %d", code)
	}

	// One recovery code, eight requests at once: it signs in once. (Past the
	// ten-minute window first: the enables above spent this person's tries.)
	g.advance(11 * time.Minute)
	var recovery []string
	for _, cs := range codes {
		if cs != nil {
			recovery = cs
		}
	}
	var in atomic.Int32
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery","code":"`+recovery[0]+`"}`); code == 200 {
				in.Add(1)
			}
		}()
	}
	wg.Wait()
	if in.Load() != 1 {
		t.Fatalf("one recovery code signed in %d times, want 1", in.Load())
	}
}

// A pending secret expires: a setup left open cannot be finished later.
func TestTwoStepPendingExpires(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	const pw = `"correct horse battery"`
	_, out := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/start", `{"password":`+pw+`}`, csrf, "1")
	secret := out["secret"].(string)
	later := g.advance(11 * time.Minute)
	code, _ := auth.TOTPCode(secret, later)
	if status, _ := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/enable", `{"password":`+pw+`,"code":"`+code+`"}`, csrf, "1"); status != http.StatusBadRequest {
		t.Fatalf("enable after the pending secret expired: %d", status)
	}
}

// An owner with two-step on acts on someone else's sign-in only with their
// own code as well: a borrowed owner session plus the password is not enough.
func TestOwnerActionsNeedTheOwnersCode(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	const pw = `"correct horse battery"`
	_, out := do(t, owner, "POST", g.srv.URL+"/api/v1/people", `{"email":"ada@site.com","role":"viewer"}`, csrf, "1")
	id := out["person"].(map[string]any)["id"].(string)
	_, out = do(t, owner, "POST", g.srv.URL+"/api/v1/account/2fa/start", `{"password":`+pw+`}`, csrf, "1")
	secret := out["secret"].(string)
	now, _ := auth.TOTPCode(secret, g.now)
	if code, _ := do(t, owner, "POST", g.srv.URL+"/api/v1/account/2fa/enable", `{"password":`+pw+`,"code":"`+now+`"}`, csrf, "1"); code != 200 {
		t.Fatalf("enable: %d", code)
	}
	for _, path := range []string{"/password", "/two-step/off"} {
		if code, out := do(t, owner, "POST", g.srv.URL+"/api/v1/people/"+id+path, `{"password":`+pw+`}`, csrf, "1"); code != http.StatusForbidden || out["needs_code"] != true {
			t.Fatalf("%s with the owner's password alone: %d %v", path, code, out)
		}
	}
	later := g.advance(time.Minute)
	c, _ := auth.TOTPCode(secret, later)
	if code, _ := do(t, owner, "POST", g.srv.URL+"/api/v1/people/"+id+"/password", `{"password":`+pw+`,"code":"`+c+`"}`, csrf, "1"); code != 200 {
		t.Fatalf("reset with the owner's code: %d", code)
	}
}

// A session without the password cannot spend someone's code tries, and the
// person's own good codes never use them up.
func TestCodeTriesCannotLockSomeoneOut(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	const pw = `"correct horse battery"`
	_, out := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/start", `{"password":`+pw+`}`, csrf, "1")
	secret := out["secret"].(string)
	now, _ := auth.TOTPCode(secret, g.now)
	if code, _ := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/enable", `{"password":`+pw+`,"code":"`+now+`"}`, csrf, "1"); code != 200 {
		t.Fatalf("enable: %d", code)
	}
	// A stolen session, no password: ten tries at enable, all refused at the password.
	for range 10 {
		do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/enable", `{"password":"wrong","code":"000000"}`, csrf, "1")
	}
	// Twelve good sign-ins in a row, a minute apart, then one more: all work.
	for i := range 13 {
		at := g.advance(time.Minute)
		code, _ := auth.TOTPCode(secret, at)
		if status, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery","code":"`+code+`"}`, "X-Real-IP", fmt.Sprintf("10.0.0.%d", i)); status != 200 {
			t.Fatalf("good sign-in %d: %d", i+1, status)
		}
	}
}
