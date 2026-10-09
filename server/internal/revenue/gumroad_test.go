package revenue

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

func gumroadPing() []byte {
	return []byte(url.Values{
		"sale_id": {"gs_1"}, "price": {"4900"}, "currency": {"usd"}, "email": {"a@b.co"},
		"sale_timestamp": {time.Now().UTC().Format(time.RFC3339)}, "url_params[trckable_vid]": {"gum42.q"},
	}.Encode())
}

// Gumroad pings are unsigned: the secret in the URL is all that stands
// between the internet and the ledger.
func TestGumroadPingNeedsTheUrlToken(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	c, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "gumroad", PublicBase: "https://stats.example"})
	if err != nil {
		t.Fatal(err)
	}
	secret, err := g.svc.Secret(ctx, c.ID)
	if err != nil || len(secret) < 20 {
		t.Fatalf("a secret is made for the owner to paste into the ping URL: %q %v", secret, err)
	}
	if strings.Contains(c.WebhookURL, secret) {
		t.Fatal("the connection listing must not carry the secret")
	}
	path, body := HookPath("gumroad", c.ID), gumroadPing()
	for name, h := range map[string]struct {
		path string
		hdr  http.Header
	}{
		"no token":                 {path, nil},
		"wrong token":              {path + "?token=" + secret + "x", nil},
		"empty token":              {path + "?token=", nil},
		"token only in a header":   {path, http.Header{"X-Trckable-Ping-Token": {secret}}},
		"header wins over nothing": {path + "?other=1", http.Header{"X-Trckable-Ping-Token": {secret}}},
	} {
		if code := g.post(t, h.path, h.hdr, body); code != http.StatusBadRequest {
			t.Errorf("%s: %d, want 400", name, code)
		}
	}
	// The sender's own header never beats the URL's token.
	if code := g.post(t, path+"?token=wrong", http.Header{"X-Trckable-Ping-Token": {secret}}, body); code != http.StatusBadRequest {
		t.Errorf("spoofed header: %d", code)
	}
	for i := 0; i < 2; i++ { // Gumroad retries: one sale
		if code := g.post(t, path+"?token="+url.QueryEscape(secret), nil, body); code != http.StatusOK {
			t.Fatalf("ping: %d", code)
		}
	}
	if _, err := g.svc.Process(ctx); err != nil {
		t.Fatal(err)
	}
	facts, _ := g.svc.Facts(ctx, g.site, "USD", time.Now().Add(-time.Hour), time.Now().Add(time.Hour), false)
	if len(facts) != 1 || facts[0].Amount != 4900 || facts[0].Visitor == 0 {
		t.Fatalf("facts: %+v", facts)
	}
}

func TestPayPalNeedsItsWebhookIdAndASignature(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	c, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "paypal", Secret: "1AB23456CD789012E", PublicBase: "https://stats.example"})
	if err != nil {
		t.Fatal(err)
	}
	body := []byte(`{"id":"WH-1","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"C","status":"COMPLETED","amount":{"currency_code":"USD","value":"5.00"}}}`)
	if code := g.post(t, HookPath("paypal", c.ID), nil, body); code != http.StatusBadRequest {
		t.Fatalf("unsigned: %d", code)
	}
	// A token in the URL means nothing to PayPal.
	if code := g.post(t, HookPath("paypal", c.ID)+"?token=1AB23456CD789012E", nil, body); code != http.StatusBadRequest {
		t.Fatalf("token instead of a signature: %d", code)
	}
}
