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

// A scheduled report goes to many people, so its link names one of them: it
// removes that address from that schedule and does nothing else.

// ReportKeyLabel names the key the report links are signed with.
const ReportKeyLabel = "report unsubscribe v1"

// ReportToken is "<schedule and address>.<signature>", safe in a URL.
func ReportToken(key []byte, scheduleID, email string) string {
	who := scheduleID + "|" + strings.ToLower(email)
	return base64.RawURLEncoding.EncodeToString([]byte(who)) + "." + sign(key, "report:"+who)
}

// ReportUnsubscribe returns the schedule and the address a token names, when
// its signature is this server's.
func ReportUnsubscribe(key []byte, token string) (scheduleID, email string, ok bool) {
	i := strings.LastIndexByte(token, '.')
	if i <= 0 {
		return "", "", false
	}
	raw, err := base64.RawURLEncoding.DecodeString(token[:i])
	if err != nil || !hmac.Equal([]byte(token[i+1:]), []byte(sign(key, "report:"+string(raw)))) {
		return "", "", false
	}
	scheduleID, email, found := strings.Cut(string(raw), "|")
	return scheduleID, email, found && scheduleID != "" && email != ""
}
