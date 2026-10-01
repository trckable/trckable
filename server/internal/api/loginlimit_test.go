package api

import (
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

func (g *rig) login(t *testing.T, email, password string) int {
	t.Helper()
	code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/login", fmt.Sprintf(`{"email":%q,"password":%q}`, email, password))
	return code
}

// loginWith signs in with the given client (and so its cookies).
func (g *rig) loginWith(t *testing.T, c *http.Client, email, password string) int {
	t.Helper()
	code, _ := do(t, c, "POST", g.srv.URL+"/api/v1/login", fmt.Sprintf(`{"email":%q,"password":%q}`, email, password))
	return code
}

// fromAddress makes every request look like it came from addr.
func (g *rig) fromAddress(addr string) { g.api.ClientIP = func(*http.Request) string { return addr } }

// Only wrong passwords use a limit up: signing in right, however often, is
// not a guess, and nobody else's sign-ins count against you.
func TestRightPasswordsNeverUseTheLoginLimitUp(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	g.fromAddress("203.0.113.5")
	for i := 0; i < 25; i++ {
		if code := g.login(t, "me@site.com", "correct horse battery"); code != http.StatusOK {
			t.Fatalf("right sign-in %d: %d", i+1, code)
		}
	}
}

// One address cannot go through every account: it runs out, the accounts do not.
func TestOneAddressRunsOutNotTheAccounts(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	g.fromAddress("203.0.113.7")
	for i := 0; i < 10; i++ {
		if code := g.login(t, fmt.Sprintf("nobody%d@site.com", i), "wrong password"); code != http.StatusUnauthorized {
			t.Fatalf("wrong password %d from one address: %d", i+1, code)
		}
	}
	if code := g.login(t, "nobody99@site.com", "wrong password"); code != http.StatusTooManyRequests {
		t.Fatalf("an 11th wrong password from one address: %d, want 429", code)
	}
	g.fromAddress("203.0.113.8")
	if code := g.login(t, "me@site.com", "correct horse battery"); code != http.StatusOK {
		t.Fatalf("the owner from another address: %d, want 200", code)
	}
}

// A guesser on one address shuts that address out of the account, and nobody
// else: the owner, anywhere else, signs in with the right password.
func TestOneAddressCannotLockTheOwnerOut(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	g.fromAddress("198.51.100.1")
	for i := 0; i < 10; i++ {
		if code := g.login(t, "me@site.com", "wrong password"); code != http.StatusUnauthorized {
			t.Fatalf("wrong password %d: %d", i+1, code)
		}
	}
	for _, pw := range []string{"wrong password", "correct horse battery"} {
		if code := g.login(t, " ME@site.com ", pw); code != http.StatusTooManyRequests {
			t.Fatalf("the guessing address with %q, the email written another way: %d, want 429", pw, code)
		}
	}
	g.fromAddress("198.51.100.2")
	if code := g.login(t, "me@site.com", "correct horse battery"); code != http.StatusOK {
		t.Fatalf("the owner from another address: %d, want 200", code)
	}
}

// Guesses spread over many addresses meet a wide account-wide cap. Past it a
// stranger's right password is refused too (it would tell a guess that lands
// from one that does not), but a browser that signed in before gets in.
func TestAccountWideLimitLetsAKnownBrowserThrough(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	var n atomic.Int64
	g.api.ClientIP = func(*http.Request) string { return fmt.Sprintf("198.51.%d.%d", n.Add(1)/200, n.Load()%200+1) }

	jar, _ := cookiejar.New(nil)
	owner := &http.Client{Jar: jar}
	if code := g.loginWith(t, owner, "me@site.com", "correct horse battery"); code != http.StatusOK {
		t.Fatalf("the owner's first sign-in: %d", code)
	}
	if code := g.loginWith(t, owner, "me@site.com", "correct horse battery"); code != http.StatusOK {
		t.Fatalf("the owner's second sign-in: %d", code)
	}
	if got := countRows(t, g, `SELECT count(*) FROM known_devices`); got != 1 {
		t.Fatalf("the owner's browser is remembered once, not %d times", got)
	}

	for i := 0; i < loginTriesAccount; i++ {
		if code := g.login(t, "me@site.com", "wrong password"); code != http.StatusUnauthorized {
			t.Fatalf("wrong password %d from its own address: %d", i+1, code)
		}
	}
	if code := g.login(t, "me@site.com", "wrong password"); code != http.StatusTooManyRequests {
		t.Fatalf("past the account-wide cap: %d, want 429", code)
	}
	if code := g.login(t, "me@site.com", "correct horse battery"); code != http.StatusTooManyRequests {
		t.Fatalf("a stranger's right password past the cap: %d, want 429", code)
	}
	if code := g.loginWith(t, owner, "me@site.com", "correct horse battery"); code != http.StatusOK {
		t.Fatalf("the owner's remembered browser past the cap: %d, want 200", code)
	}
	// The cookie opens nothing by itself: it is not a sign-in, and it is
	// for that account only.
	if code := g.loginWith(t, owner, "me@site.com", "wrong password"); code != http.StatusUnauthorized {
		t.Fatalf("the remembered browser with a wrong password: %d, want 401", code)
	}
	if code := g.loginWith(t, owner, "other@site.com", "correct horse battery"); code != http.StatusUnauthorized {
		t.Fatalf("the remembered browser against another account: %d, want 401", code)
	}
	// A forged cookie is no better than none.
	forged := &http.Client{}
	if code, _ := do(t, forged, "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery"}`, "Cookie", deviceCookie+"=tkb_d_forged.0123456789abcdef0123456789abcdef"); code != http.StatusTooManyRequests {
		t.Fatalf("a forged device cookie past the cap: %d, want 429", code)
	}
	// Resetting the password forgets the browsers.
	if err := g.ctl.ResetPassword(t.Context(), "me@site.com", "another long password"); err != nil {
		t.Fatal(err)
	}
	if got := countRows(t, g, `SELECT count(*) FROM known_devices`); got != 0 {
		t.Fatalf("%d remembered browsers after a password reset", got)
	}
	// And the server can be asked to forget the counters.
	g.api.ClearLoginLimits("ME@site.com")
	if code := g.login(t, "me@site.com", "another long password"); code != http.StatusOK {
		t.Fatalf("after the counters were cleared: %d, want 200", code)
	}
}

func countRows(t *testing.T, g *rig, q string) int {
	t.Helper()
	var n int
	if err := g.ctl.DB.QueryRowContext(t.Context(), q).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// Guesses that arrive together are held to the limit as the first ones are:
// the slot is taken before the hash, so a queue of requests waiting for the
// hashing slots cannot all pass a check made before any of them is counted.
func TestConcurrentGuessesStayWithinTheLimit(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	g.fromAddress("203.0.113.50")
	var wg sync.WaitGroup
	codes := make(chan int, 60)
	for i := 0; i < 60; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes <- g.login(t, "me@site.com", "wrong password")
		}()
	}
	wg.Wait()
	close(codes)
	got := map[int]int{}
	for c := range codes {
		got[c]++
	}
	if got[http.StatusUnauthorized] > loginTries || got[http.StatusUnauthorized]+got[http.StatusTooManyRequests] != 60 {
		t.Fatalf("60 wrong passwords at once from one address: %v, want at most %d checked and the rest 429", got, loginTries)
	}
	if got[http.StatusTooManyRequests] == 0 {
		t.Fatalf("nothing was refused: %v", got)
	}
}

// Behind a reverse proxy nothing tells visitors apart (the peer is the
// proxy's private address and no forwarded header is trusted), so an
// address's limit would be the whole site's: it is ten times wider, and the
// account's own limits do the guarding.
func TestLoginLimitBehindAProxyDoesNotLockEveryoneOut(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	// The rig's peer is 127.0.0.1 and ClientIP is the peer itself: shared.
	for i := 0; i < 50; i++ {
		if code := g.login(t, fmt.Sprintf("nobody%d@site.com", i), "wrong password"); code != http.StatusUnauthorized {
			t.Fatalf("wrong password %d behind a proxy: %d, want 401", i+1, code)
		}
	}
	if code := g.login(t, "me@site.com", "correct horse battery"); code != http.StatusOK {
		t.Fatalf("the owner after 50 junk logins from other accounts: %d, want 200", code)
	}
	for i := 50; i < 100; i++ {
		g.login(t, fmt.Sprintf("nobody%d@site.com", i), "wrong password")
	}
	if code := g.login(t, "nobody100@site.com", "wrong password"); code != http.StatusTooManyRequests {
		t.Fatalf("the widened limit is still a limit: %d, want 429", code)
	}
}

// A wrong two-step code is held against the same limits as a wrong password:
// ten from one address on one account, and the right code is refused after.
func TestWrongCodesCountAgainstTheLoginLimits(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	const pw = `"correct horse battery"`
	_, out := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/start", `{"password":`+pw+`}`, csrf, "1")
	secret := out["secret"].(string)
	now, _ := auth.TOTPCode(secret, g.now)
	if code, out := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/enable", `{"password":`+pw+`,"code":"`+now+`"}`, csrf, "1"); code != http.StatusOK {
		t.Fatalf("enable: %d %v", code, out)
	}
	g.fromAddress("203.0.113.60")
	for i := 0; i < 10; i++ {
		code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery","code":"000000"}`)
		if code != http.StatusUnauthorized {
			t.Fatalf("wrong code %d: %d", i+1, code)
		}
	}
	good, _ := auth.TOTPCode(secret, g.advance(time.Minute))
	code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery","code":"`+good+`"}`)
	if code != http.StatusTooManyRequests {
		t.Fatalf("the right code after ten wrong ones from the address: %d, want 429", code)
	}
}
