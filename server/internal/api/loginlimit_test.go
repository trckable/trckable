package api

import (
	"fmt"
	"net/http"
	"sync/atomic"
	"testing"
)

func (g *rig) login(t *testing.T, email, password string) int {
	t.Helper()
	code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/login", fmt.Sprintf(`{"email":%q,"password":%q}`, email, password))
	return code
}

// Only wrong passwords use a limit up: signing in right, however often, is
// not a guess, and nobody else's sign-ins count against you.
func TestRightPasswordsNeverUseTheLoginLimitUp(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	g.api.ClientIP = func(*http.Request) string { return "203.0.113.5" }
	for i := 0; i < 25; i++ {
		if code := g.login(t, "me@site.com", "correct horse battery"); code != http.StatusOK {
			t.Fatalf("right sign-in %d: %d", i+1, code)
		}
	}
}

// One address cannot go through every account, and (with an address per
// guess) many addresses cannot go through one account.
func TestLoginLimitsAreKeptPerAddressAndPerAccount(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	var n atomic.Int64
	g.api.ClientIP = func(*http.Request) string { return fmt.Sprintf("198.51.100.%d", n.Add(1)) } // a new address each time
	for i := 0; i < 10; i++ {
		if code := g.login(t, "me@site.com", "wrong password"); code != http.StatusUnauthorized {
			t.Fatalf("wrong password %d: %d", i+1, code)
		}
	}
	// The account has taken its ten, so the eleventh guess is refused, even
	// from an address that never guessed (and so is the right password:
	// otherwise a guess that lands would be told apart from one that does not).
	if code := g.login(t, "me@site.com", "wrong password"); code != http.StatusTooManyRequests {
		t.Fatalf("an 11th wrong password from a new address: %d, want 429", code)
	}
	if code := g.login(t, " ME@site.com ", "correct horse battery"); code != http.StatusTooManyRequests {
		t.Fatalf("the account's limit is by email, however it is written: %d, want 429", code)
	}
	// Another account is untouched by that.
	if code := g.login(t, "other@site.com", "wrong password"); code != http.StatusUnauthorized {
		t.Fatalf("another account: %d, want 401", code)
	}

	// One address, many accounts: the address runs out, not the accounts.
	g.api.ClientIP = func(*http.Request) string { return "203.0.113.7" }
	for i := 0; i < 10; i++ {
		if code := g.login(t, fmt.Sprintf("nobody%d@site.com", i), "wrong password"); code != http.StatusUnauthorized {
			t.Fatalf("wrong password %d from one address: %d", i+1, code)
		}
	}
	if code := g.login(t, "nobody99@site.com", "wrong password"); code != http.StatusTooManyRequests {
		t.Fatalf("an 11th wrong password from one address: %d, want 429", code)
	}
}

// Behind a reverse proxy nothing tells visitors apart (the peer is the
// proxy's private address and no forwarded header is trusted), so an
// address's limit would be the whole site's: it is ten times wider, and the
// account's own limit does the guarding. A client address trusted from a
// header gets the plain limit.
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
