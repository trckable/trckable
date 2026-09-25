package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// Two-step sign-in, RFC 6238, in about sixty lines. Every authenticator app
// speaks this, and writing it here keeps trckable's dependency list short —
// the same reason the webhook signatures are hand-checked.

// TOTPStep is the window every authenticator uses.
const TOTPStep = 30 * time.Second

var totpB32 = base32.StdEncoding.WithPadding(base32.NoPadding)

// NewTOTPSecret returns a fresh base32 secret for an authenticator app.
func NewTOTPSecret() (string, error) {
	b := make([]byte, 20) // 160 bits, what RFC 4226 recommends
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return totpB32.EncodeToString(b), nil
}

// TOTPURI is what a QR code encodes, and what can be typed by hand.
func TOTPURI(secret, issuer, account string) string {
	v := url.Values{}
	v.Set("secret", secret)
	v.Set("issuer", issuer)
	v.Set("algorithm", "SHA1")
	v.Set("digits", "6")
	v.Set("period", "30")
	return "otpauth://totp/" + url.PathEscape(issuer+":"+account) + "?" + v.Encode()
}

// TOTPCode is the six digits for one moment.
func TOTPCode(secret string, at time.Time) (string, error) {
	key, err := totpB32.DecodeString(strings.ToUpper(strings.ReplaceAll(secret, " ", "")))
	if err != nil {
		return "", fmt.Errorf("that secret is not valid")
	}
	var buf [8]byte
	binary.BigEndian.PutUint64(buf[:], uint64(at.Unix())/uint64(TOTPStep.Seconds()))
	mac := hmac.New(sha1.New, key)
	mac.Write(buf[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	value := binary.BigEndian.Uint32(sum[offset:offset+4]) & 0x7fffffff
	return fmt.Sprintf("%06d", value%1_000_000), nil
}

// VerifyTOTP accepts the code for now, and for one step either side, so a
// slow phone or a slow person still works.
func VerifyTOTP(secret, code string, now time.Time) bool {
	_, ok := TOTPStepOf(secret, code, now)
	return ok
}

// TOTPStepOf is VerifyTOTP that also says which 30-second step the code
// belongs to, so the caller can refuse a step it has already accepted: a code
// seen over a shoulder, or replayed from a log, must not sign in again.
func TOTPStepOf(secret, code string, now time.Time) (int64, bool) {
	code = strings.TrimSpace(strings.ReplaceAll(code, " ", ""))
	// An empty secret has codes anyone can compute: never a match.
	if strings.TrimSpace(secret) == "" || len(code) != 6 {
		return 0, false
	}
	for _, drift := range []time.Duration{0, -TOTPStep, TOTPStep} {
		at := now.Add(drift)
		want, err := TOTPCode(secret, at)
		if err != nil {
			return 0, false
		}
		if subtle.ConstantTimeCompare([]byte(want), []byte(code)) == 1 {
			return at.Unix() / int64(TOTPStep.Seconds()), true
		}
	}
	return 0, false
}
