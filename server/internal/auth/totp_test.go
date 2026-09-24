package auth

import (
	"testing"
	"time"
)

// The RFC 6238 test vector, so this is not merely self-consistent.
func TestTOTPMatchesTheRFC(t *testing.T) {
	// "12345678901234567890" in base32, the RFC's shared secret.
	secret := "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
	for _, c := range []struct {
		unix int64
		want string
	}{
		{59, "287082"},
		{1111111109, "081804"},
		{1234567890, "005924"},
	} {
		got, err := TOTPCode(secret, time.Unix(c.unix, 0))
		if err != nil {
			t.Fatal(err)
		}
		if got != c.want {
			t.Fatalf("at %d: got %s, want %s", c.unix, got, c.want)
		}
	}
}

func TestVerifyAcceptsDriftAndRejectsTheRest(t *testing.T) {
	secret, err := NewTOTPSecret()
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	code, _ := TOTPCode(secret, now)
	if !VerifyTOTP(secret, code, now) {
		t.Fatal("the current code was rejected")
	}
	// A code from the step before still works: phones and people are slow.
	old, _ := TOTPCode(secret, now.Add(-TOTPStep))
	if !VerifyTOTP(secret, old, now) {
		t.Fatal("the previous code was rejected")
	}
	// Two steps out is too far.
	older, _ := TOTPCode(secret, now.Add(-3*TOTPStep))
	if older != code && VerifyTOTP(secret, older, now) {
		t.Fatal("a code from a minute and a half ago was accepted")
	}
	for _, bad := range []string{"", "12345", "abcdef", "0000000"} {
		if VerifyTOTP(secret, bad, now) {
			t.Fatalf("accepted %q", bad)
		}
	}
}

func TestURIIsScannable(t *testing.T) {
	uri := TOTPURI("GEZDGNBVGY3TQOJQ", "trckable", "me@example.com")
	for _, want := range []string{"otpauth://totp/", "secret=GEZDGNBVGY3TQOJQ", "issuer=trckable", "digits=6", "period=30"} {
		if !contains(uri, want) {
			t.Fatalf("%q missing from %s", want, uri)
		}
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 || indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
