package payments

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"
)

var now = time.Unix(1758500000, 0)

func sign(t *testing.T, provider, secret string, body []byte, ts int64) http.Header {
	t.Helper()
	h := http.Header{}
	switch provider {
	case "stripe":
		sig := hex.EncodeToString(hmacSHA256([]byte(secret), []byte(fmt.Sprintf("%d.%s", ts, body))))
		h.Set("Stripe-Signature", fmt.Sprintf("t=%d,v1=%s,v0=deadbeef", ts, sig))
	case "paddle":
		sig := hex.EncodeToString(hmacSHA256([]byte(secret), []byte(fmt.Sprintf("%d:%s", ts, body))))
		h.Set("Paddle-Signature", fmt.Sprintf("ts=%d;h1=%s", ts, sig))
	case "lemonsqueezy":
		h.Set("X-Signature", hex.EncodeToString(hmacSHA256([]byte(secret), body)))
	case "polar-legacy": // key = raw secret bytes
		h = stdHeaders([]byte(secret), body, ts)
	case "polar-standard", "dodo": // key = base64-decoded whsec_ part
		k, _ := base64.StdEncoding.DecodeString(strings.TrimPrefix(secret, "whsec_"))
		h = stdHeaders(k, body, ts)
	}
	return h
}

func stdHeaders(key, body []byte, ts int64) http.Header {
	h := http.Header{}
	id := "msg_2Lh9"
	sig := base64.StdEncoding.EncodeToString(hmacSHA256(key, []byte(fmt.Sprintf("%s.%d.%s", id, ts, body))))
	h.Set("webhook-id", id)
	h.Set("webhook-timestamp", fmt.Sprint(ts))
	h.Set("webhook-signature", "v1,bm90IGl0 v1,"+sig) // several signatures, one valid
	return h
}

func TestVerifyEveryProvider(t *testing.T) {
	raw := make([]byte, 32)
	rand.Read(raw)
	whsec := "whsec_" + base64.StdEncoding.EncodeToString(raw)
	cases := []struct {
		name, provider, secret string
		stale                  bool // provider checks timestamps
	}{
		{"stripe", "stripe", "whsec_stripe_test_secret", true},
		{"paddle", "paddle", "pdl_ntfset_01h_secret", true},
		{"lemonsqueezy", "lemonsqueezy", "ls-signing-secret", false},
		{"polar-legacy", "polar", "polar_whs_legacySecretValue", true},
		{"polar-legacy-whsec", "polar", whsec, true}, // whsec_ prefix but legacy-signed (Jun–Sep 2026)
		{"polar-standard", "polar", whsec, true},
		{"dodo", "dodo", whsec, true},
	}
	body := []byte(`{"type":"test","id":"evt_1"}`)
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := Registry[c.provider]
			mode := c.name
			if c.name == "polar-legacy-whsec" {
				mode = "polar-legacy"
			}
			h := sign(t, mode, c.secret, body, now.Unix())
			if err := p.Verify(h, body, c.secret, now); err != nil {
				t.Fatalf("valid signature rejected: %v", err)
			}
			if err := p.Verify(h, body, c.secret+"x", now); err == nil {
				t.Fatal("wrong secret accepted")
			}
			if err := p.Verify(h, []byte(`{"type":"test","id":"evt_2"}`), c.secret, now); err == nil {
				t.Fatal("tampered body accepted")
			}
			if err := p.Verify(http.Header{}, body, c.secret, now); err == nil {
				t.Fatal("unsigned request accepted")
			}
			if err := p.Verify(sign(t, mode, "", body, now.Unix()), body, "", now); err == nil {
				t.Fatal("empty secret accepted a forgery signed with an empty key")
			}
			if c.stale {
				old := sign(t, mode, c.secret, body, now.Add(-10*time.Minute).Unix())
				if err := p.Verify(old, body, c.secret, now); err != ErrStale {
					t.Fatalf("replayed old webhook: %v", err)
				}
			}
		})
	}
}

func TestStripeIgnoresV0(t *testing.T) {
	body := []byte(`{}`)
	sig := hex.EncodeToString(hmacSHA256([]byte("s"), []byte(fmt.Sprintf("%d.%s", now.Unix(), body))))
	h := http.Header{}
	h.Set("Stripe-Signature", fmt.Sprintf("t=%d,v0=%s", now.Unix(), sig))
	if err := Registry["stripe"].Verify(h, body, "s", now); err == nil {
		t.Fatal("v0 signature accepted (downgrade)")
	}
}

func TestParseVisitor(t *testing.T) {
	cases := map[string]uint64{
		"a1b2c3.qx9":          606857619, // base36 "a1b2c3"
		"a1b2c3":              606857619,
		"trckable_a1b2c3_qx9": 606857619,
		"order_123":           0, // someone else's reference
		"12-34":               0,
		"":                    0,
		"zzzzzzzzzzzzzz":      0, // too long for 64 bits
	}
	for in, want := range cases {
		if got := ParseVisitor(in); got != want {
			t.Errorf("ParseVisitor(%q) = %d, want %d", in, got, want)
		}
	}
	if strictVisitor("12345") != 0 || strictVisitor("trckable_a1b2c3_x") != 606857619 {
		t.Error("strictVisitor must require the trckable_ prefix")
	}
}
