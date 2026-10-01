package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/ingest"
)

const (
	loginTries  = 10 // wrong passwords one address, and one account on one address, may take in loginWindow
	loginWindow = 10 * time.Minute
	// loginTriesAccount is how many wrong passwords one account takes from
	// every address together in loginWindow. It is wide on purpose: past it,
	// only a browser that signed in to the account before gets in (see
	// rememberDevice), so whoever is guessing can slow the owner down from
	// other addresses, never lock them out of their own browser.
	loginTriesAccount = 100
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

func normEmail(email string) string {
	e := strings.ToLower(strings.TrimSpace(email))
	if len(e) > 254 {
		e = e[:254]
	}
	return e
}

// loginLimits are the counters a sign-in attempt is held against:
//   - the address, whatever account it tries (a wider ceiling when every
//     visitor looks like one proxy address, see ipMax);
//   - the account on this address, so a guesser on one address blocks that
//     address from the account and nobody else;
//   - the account from everywhere, a wide cap on a guess spread over many
//     addresses.
//
// A browser that signed in to this account before is held to the address
// limit only: it is the owner's, and a stranger's guesses must not shut it out.
func (a *API) loginLimits(r *http.Request, email string) []limit {
	e := normEmail(email)
	ip := a.ip(r)
	byIP := limit{"login:" + ip, a.ipMax(r, loginTries), loginWindow}
	if a.knownDevice(r, e) {
		return []limit{byIP}
	}
	return []limit{
		byIP,
		{"login-pair:" + e + "|" + ip, loginTries, loginWindow},
		{"login-account:" + e, loginTriesAccount, loginWindow},
	}
}

// ClearLoginLimits forgets the sign-in counters of an account, and of every
// address, so that whoever was locked out can sign in again at once. It is
// what `trckabled admin reset-password` asks the running server for.
func (a *API) ClearLoginLimits(email string) {
	a.init()
	a.loginRate.clear("login-account:" + normEmail(email))
	a.loginRate.clearPrefix("login-pair:" + normEmail(email) + "|")
	a.loginRate.clearPrefix("login:")
}

// ---- remembered browsers ----

const (
	deviceCookie = "trckable_device"
	deviceTTL    = 365 * 24 * time.Hour
)

// A remembered browser's cookie is "<random id>.<signature>": the id is kept
// hashed in the control database, and the signature (a key only this server
// has) lets a forged cookie be turned away without a lookup. It holds nothing
// else, and it is not a session: it opens nothing by itself.
func (a *API) deviceSig(id string) string {
	mac := hmac.New(sha256.New, a.Box.Derive("known-device"))
	mac.Write([]byte(id))
	return hex.EncodeToString(mac.Sum(nil))[:32]
}

// knownDevice says whether the request carries the cookie of a browser that
// signed in to the account with this (normalised) email.
func (a *API) knownDevice(r *http.Request, email string) bool {
	if a.Box == nil {
		return false
	}
	c, err := r.Cookie(deviceCookie)
	if err != nil {
		return false
	}
	id, sig, ok := strings.Cut(c.Value, ".")
	if !ok || !hmac.Equal([]byte(sig), []byte(a.deviceSig(id))) {
		return false
	}
	return a.Ctl.KnownDeviceEmail(r.Context(), id) == email
}

// rememberDevice gives a browser that just signed in the cookie, unless it
// has one for this account already.
func (a *API) rememberDevice(w http.ResponseWriter, r *http.Request, userID, email string) {
	if a.Box == nil || a.knownDevice(r, normEmail(email)) {
		return
	}
	id, err := a.Ctl.NewKnownDevice(r.Context(), userID)
	if err != nil {
		return // only the extra protection is lost
	}
	//nolint:gosec // Secure whenever the request came over https; plain http is for localhost and private networks, where a Secure cookie would never be sent
	http.SetCookie(w, &http.Cookie{
		Name: deviceCookie, Value: id + "." + a.deviceSig(id), Path: "/", MaxAge: int(deviceTTL.Seconds()),
		HttpOnly: true, Secure: r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https", SameSite: http.SameSiteLaxMode,
	})
}
