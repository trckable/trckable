package alerts

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"strings"
)

// An email carries the address that stops it, and that address works without
// signing in: the person is reading mail, not the dashboard. It names one
// alert (and an alert belongs to one site) and is signed with a key only this
// server has, so it can turn off that alert and nothing else.

// KeyLabel names the key (secrets.Box.Derive) the links are signed with.
const KeyLabel = "unsubscribe v1"

// UnsubscribeToken is "<alert id>.<signature>", safe in a URL.
func UnsubscribeToken(key []byte, alertID string) string {
	return alertID + "." + sign(key, alertID)
}

// UnsubscribeAlert returns the alert id a token names, when its signature is
// this server's.
func UnsubscribeAlert(key []byte, token string) (string, bool) {
	i := strings.LastIndexByte(token, '.')
	if i <= 0 {
		return "", false
	}
	id, sig := token[:i], token[i+1:]
	return id, hmac.Equal([]byte(sig), []byte(sign(key, id)))
}

func sign(key []byte, id string) string {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(id))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil)[:16])
}
