package api

import (
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/ingest"
)

const (
	loginTries  = 10 // wrong passwords one address, and one account, may take in loginWindow
	loginWindow = 10 * time.Minute
	// sharedPeerFactor widens every per-address limit when all visitors look
	// like one address (a reverse proxy next to the server, and no forwarded
	// header trusted): the address then stands for everyone, so its limit is
	// a limit on the whole site and would lock everybody out. Setting
	// TRCKABLE_TRUST_PROXY is the real fix; the server says so in its log.
	sharedPeerFactor = 10
)

// ipMax is the ceiling of a per-address limit for this request.
func (a *API) ipMax(r *http.Request, base int) int {
	if ingest.SharedPeer(r, a.clientHost(r)) {
		return base * sharedPeerFactor
	}
	return base
}

// clientHost is the address trckable resolves for the request, as is (the
// limits count its /64 for IPv6, see ip).
func (a *API) clientHost(r *http.Request) string {
	if a.ClientIP != nil {
		return a.ClientIP(r)
	}
	h, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return h
}

func loginAccountKey(email string) string {
	e := strings.ToLower(strings.TrimSpace(email))
	if len(e) > 254 {
		e = e[:254]
	}
	return "login-account:" + e
}

// loginIPBlocked and loginAccountBlocked say whether this address, or this account, has used up its
// wrong passwords. Only wrong ones count (loginFailed): a person who signs in
// right never uses a limit up, and nobody else's successful sign-ins use up
// theirs. An account is counted wherever the guesses come from, so many
// addresses cannot take guesses at one password without end, and an address
// is counted whatever account it tries, so one address cannot go through
// every account.
func (a *API) loginIPBlocked(r *http.Request) bool {
	return a.loginRate.full("login:"+a.ip(r), a.Now(), a.ipMax(r, loginTries), loginWindow)
}

func (a *API) loginAccountBlocked(email string) bool {
	return a.loginRate.full(loginAccountKey(email), a.Now(), loginTries, loginWindow)
}

// loginFailed counts a wrong password or code against the address and, for a
// wrong password, the account.
func (a *API) loginFailed(r *http.Request, email string, password bool) {
	a.loginRate.record("login:"+a.ip(r), a.Now())
	if password {
		a.loginRate.record(loginAccountKey(email), a.Now())
	}
}

// loginSucceeded forgets the account's wrong passwords: it was its owner.
// The address's count stays, so signing in to one's own account between
// guesses at another buys nothing.
func (a *API) loginSucceeded(email string) {
	a.loginRate.clear(loginAccountKey(email))
}
