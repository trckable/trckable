package payments

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func hmacSHA256(key, msg []byte) []byte {
	m := hmac.New(sha256.New, key)
	m.Write(msg)
	return m.Sum(nil)
}

func fresh(ts int64, now time.Time) bool {
	d := now.Sub(time.Unix(ts, 0))
	return d < Tolerance && d > -Tolerance
}

// verifyStandardWebhooks implements https://www.standardwebhooks.com
// (Polar, Dodo): HMAC-SHA256 over "id.timestamp.body", base64, "v1,<sig>"
// entries separated by spaces. keys are tried in order (secret formats).
func verifyStandardWebhooks(h http.Header, body []byte, keys [][]byte, now time.Time) error {
	id, tsS, sigs := h.Get("webhook-id"), h.Get("webhook-timestamp"), h.Get("webhook-signature")
	if id == "" || tsS == "" || sigs == "" {
		return ErrSignature
	}
	ts, err := strconv.ParseInt(tsS, 10, 64)
	if err != nil {
		return ErrSignature
	}
	if !fresh(ts, now) {
		return ErrStale
	}
	msg := []byte(id + "." + tsS + "." + string(body))
	for _, key := range keys {
		want := hmacSHA256(key, msg)
		for _, s := range strings.Fields(sigs) {
			v, sig, ok := strings.Cut(s, ",")
			if !ok || v != "v1" {
				continue
			}
			got, err := base64.StdEncoding.DecodeString(sig)
			if err == nil && hmac.Equal(got, want) {
				return nil
			}
		}
	}
	return ErrSignature
}

// standardKeys derives candidate HMAC keys from a Standard Webhooks secret:
// "whsec_<base64>" decodes to the key; other secrets are tried both as raw
// bytes (Polar's SDK convention) and base64-decoded.
func standardKeys(secret string) [][]byte {
	secret = strings.TrimSpace(secret)
	var keys [][]byte
	for _, prefix := range []string{"whsec_", "polar_whs_"} {
		if rest, ok := strings.CutPrefix(secret, prefix); ok {
			if k, err := base64.StdEncoding.DecodeString(rest); err == nil {
				keys = append(keys, k)
			}
		}
	}
	keys = append(keys, []byte(secret))
	if k, err := base64.StdEncoding.DecodeString(secret); err == nil && len(k) >= 16 {
		keys = append(keys, k)
	}
	return keys
}

// hexHMACEqual compares a hex signature with HMAC-SHA256(key, msg).
func hexHMACEqual(sigHex string, key, msg []byte) bool {
	got, err := hex.DecodeString(strings.TrimSpace(sigHex))
	return err == nil && hmac.Equal(got, hmacSHA256(key, msg))
}

// signedPairs parses "k=v,k=v" / "k=v;k=v" signature headers (Stripe, Paddle).
func signedPairs(header, sep string) (ts int64, sigs map[string][]string, ok bool) {
	sigs = map[string][]string{}
	for _, part := range strings.Split(header, sep) {
		k, v, found := strings.Cut(strings.TrimSpace(part), "=")
		if !found {
			continue
		}
		if k == "t" || k == "ts" {
			n, err := strconv.ParseInt(v, 10, 64)
			if err != nil {
				return 0, nil, false
			}
			ts = n
			continue
		}
		sigs[k] = append(sigs[k], v)
	}
	return ts, sigs, ts != 0
}
