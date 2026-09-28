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

// While a secret is rolled, providers sign with the old and the new secret
// at once (Stripe: several v1 entries, https://docs.stripe.com/webhooks#roll-endpoint-secrets;
// Paddle: several h1 entries, https://developer.paddle.com/webhooks/signature-verification;
// Standard Webhooks: space-separated v1 entries, https://www.standardwebhooks.com).
// Whichever secret trckable holds, the delivery verifies. A timestamp from
// the future is refused like an old one (the window is ±5 minutes; Paddle
// recommends 5 s, which clock skew alone would break, and a replay inside
// the window is harmless: it dedupes on its event key).
func TestSecretRotationAndFutureTimestamps(t *testing.T) {
	body := []byte(`{"id":"evt_rot"}`)
	ts := now.Unix()
	oldS, newS := "whsec_old_secret_value", "whsec_new_secret_value"
	hexSig := func(secret, msg string) string { return hex.EncodeToString(hmacSHA256([]byte(secret), []byte(msg))) }

	h := http.Header{}
	h.Set("Stripe-Signature", fmt.Sprintf("t=%d,v1=%s,v1=%s", ts, hexSig(newS, fmt.Sprintf("%d.%s", ts, body)), hexSig(oldS, fmt.Sprintf("%d.%s", ts, body))))
	for _, s := range []string{oldS, newS} {
		if err := Registry["stripe"].Verify(h, body, s, now); err != nil {
			t.Errorf("stripe rotation, holding %s: %v", s, err)
		}
	}
	h = http.Header{}
	h.Set("Paddle-Signature", fmt.Sprintf("ts=%d;h1=%s;h1=%s", ts, hexSig(newS, fmt.Sprintf("%d:%s", ts, body)), hexSig(oldS, fmt.Sprintf("%d:%s", ts, body))))
	for _, s := range []string{oldS, newS} {
		if err := Registry["paddle"].Verify(h, body, s, now); err != nil {
			t.Errorf("paddle rotation, holding %s: %v", s, err)
		}
	}
	k1, k2 := make([]byte, 24), make([]byte, 24)
	rand.Read(k1)
	rand.Read(k2)
	w1, w2 := "whsec_"+base64.StdEncoding.EncodeToString(k1), "whsec_"+base64.StdEncoding.EncodeToString(k2)
	msg := fmt.Sprintf("msg_rot.%d.%s", ts, body)
	h = http.Header{}
	h.Set("webhook-id", "msg_rot")
	h.Set("webhook-timestamp", fmt.Sprint(ts))
	h.Set("webhook-signature", "v1,"+base64.StdEncoding.EncodeToString(hmacSHA256(k2, []byte(msg)))+" v1,"+base64.StdEncoding.EncodeToString(hmacSHA256(k1, []byte(msg))))
	for _, p := range []string{"polar", "dodo"} {
		for _, s := range []string{w1, w2} {
			if err := Registry[p].Verify(h, body, s, now); err != nil {
				t.Errorf("%s rotation: %v", p, err)
			}
		}
	}

	future := now.Add(10 * time.Minute).Unix()
	for _, c := range []struct{ provider, mode, secret string }{
		{"stripe", "stripe", oldS}, {"paddle", "paddle", oldS}, {"polar", "polar-standard", w1}, {"dodo", "dodo", w1},
	} {
		h := sign(t, c.mode, c.secret, body, future)
		if err := Registry[c.provider].Verify(h, body, c.secret, now); err != ErrStale {
			t.Errorf("%s accepted a timestamp 10 minutes ahead: %v", c.provider, err)
		}
		h = sign(t, c.mode, c.secret, body, now.Add(-4*time.Minute).Unix())
		if err := Registry[c.provider].Verify(h, body, c.secret, now); err != nil {
			t.Errorf("%s refused a delivery 4 minutes old (a slow retry): %v", c.provider, err)
		}
	}
}
