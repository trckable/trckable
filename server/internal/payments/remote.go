package payments

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Remote is a provider's REST API, used for one-key setup (trckable creates
// the webhook endpoint itself) and nightly reconciliation (the real "no lost
// payments" guarantee: webhooks can be missed, the API can't lie).
//
// Reconciliation returns webhook-shaped bodies that go through the same
// inbox and parser as real webhooks, keyed so a payment seen by both is
// stored once.
type Remote interface {
	// Setup creates a webhook endpoint pointing at hookURL.
	Setup(ctx context.Context, key string, test bool, hookURL string) (Setup, error)
	// Teardown deletes the endpoint trckable created (best effort).
	Teardown(ctx context.Context, key string, test bool, s Setup) error
	// Sync lists payments, refunds and disputes changed since `since`.
	Sync(ctx context.Context, key string, test bool, s Setup, since time.Time) ([]Raw, error)
}

// Setup is what a connection remembers about its provider-side endpoint.
type Setup struct {
	RemoteID   string // webhook endpoint id
	Secret     string // signing secret
	AccountRef string // store / organization id when later calls need it
	Label      string // human name (account, store)
	Test       bool   // the key is a test/sandbox key
}

// Raw is one webhook-shaped body produced by reconciliation.
type Raw struct {
	Key  string
	Body []byte
}

// Remotes lists the provider APIs. BaseURLs can be overridden in tests.
var Remotes = map[string]Remote{
	"stripe":       &StripeAPI{},
	"lemonsqueezy": &LemonSqueezyAPI{},
	"polar":        &PolarAPI{},
	"paddle":       &PaddleAPI{},
	"dodo":         &DodoAPI{},
}

// HTTPClient is used for every provider call.
var HTTPClient = &http.Client{Timeout: 20 * time.Second}

// APIError is a provider API failure, with the provider's message.
type APIError struct {
	Status  int
	Message string
}

func (e *APIError) Error() string { return fmt.Sprintf("provider API %d: %s", e.Status, e.Message) }

func call(ctx context.Context, method, u string, hdr map[string]string, body io.Reader, out any) error {
	req, err := http.NewRequestWithContext(ctx, method, u, body)
	if err != nil {
		return err
	}
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	req.Header.Set("User-Agent", "trckable (+https://trckable.com)")
	res, err := HTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	b, err := io.ReadAll(io.LimitReader(res.Body, 32<<20))
	if err != nil {
		return err
	}
	if res.StatusCode >= 300 {
		return &APIError{Status: res.StatusCode, Message: providerMessage(b, res.Status)}
	}
	if out != nil && len(b) > 0 {
		return json.Unmarshal(b, out)
	}
	return nil
}

// providerMessage digs the human error out of the providers' error shapes.
func providerMessage(b []byte, fallback string) string {
	var e struct {
		Error  any `json:"error"`
		Errors []struct {
			Detail string `json:"detail"`
			Title  string `json:"title"`
		} `json:"errors"`
		Detail  any    `json:"detail"`
		Message string `json:"message"`
	}
	if json.Unmarshal(b, &e) == nil {
		switch v := e.Error.(type) {
		case string:
			return v
		case map[string]any:
			if m, ok := v["message"].(string); ok {
				return m
			}
			if m, ok := v["detail"].(string); ok {
				return m
			}
		}
		if len(e.Errors) > 0 {
			return strings.TrimSpace(e.Errors[0].Title + " " + e.Errors[0].Detail)
		}
		if s, ok := e.Detail.(string); ok {
			return s
		}
		if e.Message != "" {
			return e.Message
		}
	}
	if len(b) > 0 && len(b) < 300 {
		return string(b)
	}
	return fallback
}

func bearer(key string) map[string]string {
	return map[string]string{"Authorization": "Bearer " + key, "Accept": "application/json"}
}

func jsonBody(v any) io.Reader { b, _ := json.Marshal(v); return bytes.NewReader(b) }

func randomSecret() string {
	b := make([]byte, 20)
	rand.Read(b)
	return hex.EncodeToString(b)[:40] // Lemon Squeezy allows 6–40 characters
}

// ---------------------------------------------------------------- Stripe

// StripeAPI talks to api.stripe.com.
type StripeAPI struct{ BaseURL string }

func (a *StripeAPI) base() string {
	if a.BaseURL != "" {
		return a.BaseURL
	}
	return "https://api.stripe.com"
}

func stripeHdr(key string) map[string]string {
	h := bearer(key)
	h["Content-Type"] = "application/x-www-form-urlencoded"
	h["Stripe-Version"] = StripeAPIVersion
	return h
}

func (a *StripeAPI) Setup(ctx context.Context, key string, _ bool, hookURL string) (Setup, error) {
	f := url.Values{"url": {hookURL}, "api_version": {StripeAPIVersion}, "description": {"trckable revenue attribution"}}
	for _, e := range StripeEvents {
		f.Add("enabled_events[]", e)
	}
	var out struct {
		ID       string `json:"id"`
		Secret   string `json:"secret"`
		Livemode bool   `json:"livemode"`
	}
	if err := call(ctx, "POST", a.base()+"/v1/webhook_endpoints", stripeHdr(key), strings.NewReader(f.Encode()), &out); err != nil {
		return Setup{}, err
	}
	s := Setup{RemoteID: out.ID, Secret: out.Secret, Test: !out.Livemode, Label: "Stripe"}
	var acct struct {
		Settings struct {
			Dashboard struct {
				DisplayName string `json:"display_name"`
			} `json:"dashboard"`
		} `json:"settings"`
	}
	if call(ctx, "GET", a.base()+"/v1/account", stripeHdr(key), nil, &acct) == nil && acct.Settings.Dashboard.DisplayName != "" {
		s.Label = acct.Settings.Dashboard.DisplayName
	}
	return s, nil
}

func (a *StripeAPI) Teardown(ctx context.Context, key string, _ bool, s Setup) error {
	if s.RemoteID == "" {
		return nil
	}
	return call(ctx, "DELETE", a.base()+"/v1/webhook_endpoints/"+url.PathEscape(s.RemoteID), stripeHdr(key), nil, nil)
}

// Sync replays Stripe's own events (kept 30 days): the exact webhook bodies,
// keyed by event id, so they dedupe against delivered webhooks.
func (a *StripeAPI) Sync(ctx context.Context, key string, _ bool, _ Setup, since time.Time) ([]Raw, error) {
	if min := time.Now().Add(-30 * 24 * time.Hour); since.Before(min) {
		since = min
	}
	var out []Raw
	for _, group := range [][]string{StripeEvents[:6], StripeEvents[6:]} { // types[] allows 20 per call
		after := ""
		for page := 0; page < 200; page++ {
			q := url.Values{"limit": {"100"}, "created[gte]": {fmt.Sprint(since.Unix())}}
			for _, t := range group {
				q.Add("types[]", t)
			}
			if after != "" {
				q.Set("starting_after", after)
			}
			var list struct {
				Data    []json.RawMessage `json:"data"`
				HasMore bool              `json:"has_more"`
			}
			if err := call(ctx, "GET", a.base()+"/v1/events?"+q.Encode(), stripeHdr(key), nil, &list); err != nil {
				return out, err
			}
			for _, raw := range list.Data {
				var id struct {
					ID string `json:"id"`
				}
				json.Unmarshal(raw, &id)
				out = append(out, Raw{Key: id.ID, Body: raw})
				after = id.ID
			}
			if !list.HasMore || len(list.Data) == 0 {
				break
			}
		}
	}
	return out, nil
}

// ---------------------------------------------------------- Lemon Squeezy

// LemonSqueezyAPI talks to api.lemonsqueezy.com (JSON:API).
type LemonSqueezyAPI struct{ BaseURL string }

func (a *LemonSqueezyAPI) base() string {
	if a.BaseURL != "" {
		return a.BaseURL
	}
	return "https://api.lemonsqueezy.com"
}

func lsHdr(key string) map[string]string {
	return map[string]string{"Authorization": "Bearer " + key, "Accept": "application/vnd.api+json", "Content-Type": "application/vnd.api+json"}
}

func (a *LemonSqueezyAPI) Setup(ctx context.Context, key string, _ bool, hookURL string) (Setup, error) {
	var stores struct {
		Data []struct {
			ID         string `json:"id"`
			Attributes struct {
				Name string `json:"name"`
			} `json:"attributes"`
		} `json:"data"`
	}
	if err := call(ctx, "GET", a.base()+"/v1/stores", lsHdr(key), nil, &stores); err != nil {
		return Setup{}, err
	}
	if len(stores.Data) == 0 {
		return Setup{}, errors.New("this Lemon Squeezy API key has no stores")
	}
	store := stores.Data[0]
	secret := randomSecret() // Lemon Squeezy lets the caller choose the secret
	var ids []string
	for _, test := range []bool{false, true} { // live and test-mode events to the same URL
		body := map[string]any{"data": map[string]any{
			"type":          "webhooks",
			"attributes":    map[string]any{"url": hookURL, "events": LemonSqueezyEvents, "secret": secret, "test_mode": test},
			"relationships": map[string]any{"store": map[string]any{"data": map[string]any{"type": "stores", "id": store.ID}}},
		}}
		var out struct {
			Data struct {
				ID string `json:"id"`
			} `json:"data"`
		}
		if err := call(ctx, "POST", a.base()+"/v1/webhooks", lsHdr(key), jsonBody(body), &out); err != nil {
			if test && len(ids) > 0 {
				break // test-mode webhook is a nice-to-have
			}
			return Setup{}, err
		}
		ids = append(ids, out.Data.ID)
	}
	return Setup{RemoteID: strings.Join(ids, ","), Secret: secret, AccountRef: store.ID, Label: store.Attributes.Name}, nil
}

func (a *LemonSqueezyAPI) Teardown(ctx context.Context, key string, _ bool, s Setup) error {
	var first error
	for _, id := range strings.Split(s.RemoteID, ",") {
		if id == "" {
			continue
		}
		if err := call(ctx, "DELETE", a.base()+"/v1/webhooks/"+url.PathEscape(id), lsHdr(key), nil, nil); err != nil && first == nil {
			first = err
		}
	}
	return first
}

// Sync lists orders and subscription invoices (newest first) back to since.
// List responses carry no checkout custom data, so a payment first seen here
// counts in totals but is attributed only through its customer/subscription.
func (a *LemonSqueezyAPI) Sync(ctx context.Context, key string, _ bool, s Setup, since time.Time) ([]Raw, error) {
	var out []Raw
	for _, kind := range []struct{ path, event string }{{"orders", "order_created"}, {"subscription-invoices", "subscription_payment_success"}} {
		for page := 1; page <= 500; page++ {
			q := url.Values{"filter[store_id]": {s.AccountRef}, "page[size]": {"100"}, "page[number]": {fmt.Sprint(page)}}
			var list struct {
				Data []json.RawMessage `json:"data"`
				Meta struct {
					Page struct {
						LastPage int `json:"lastPage"`
					} `json:"page"`
				} `json:"meta"`
			}
			if err := call(ctx, "GET", a.base()+"/v1/"+kind.path+"?"+q.Encode(), lsHdr(key), nil, &list); err != nil {
				return out, err
			}
			done := false
			for _, raw := range list.Data {
				var o struct {
					Attributes struct {
						CreatedAt string `json:"created_at"`
					} `json:"attributes"`
				}
				json.Unmarshal(raw, &o)
				if t := rfc3339ms(o.Attributes.CreatedAt); t != 0 && t < since.UnixMilli() {
					done = true
					break
				}
				body, _ := json.Marshal(map[string]any{"meta": map[string]any{"event_name": kind.event}, "data": raw})
				ev, err := lemonSqueezy{}.Parse(body)
				if err == nil {
					out = append(out, Raw{Key: ev.Key, Body: body})
				}
			}
			if done || page >= list.Meta.Page.LastPage || len(list.Data) == 0 {
				break
			}
		}
	}
	return out, nil
}

// ----------------------------------------------------------------- Polar

// PolarAPI talks to api.polar.sh (sandbox-api.polar.sh in test mode).
type PolarAPI struct{ BaseURL, SandboxURL string }

func (a *PolarAPI) base(test bool) string {
	switch {
	case test && a.SandboxURL != "":
		return a.SandboxURL
	case test:
		return "https://sandbox-api.polar.sh"
	case a.BaseURL != "":
		return a.BaseURL
	}
	return "https://api.polar.sh"
}

func polarHdr(key string) map[string]string {
	h := bearer(key)
	h["Content-Type"] = "application/json"
	h["Polar-Version"] = PolarAPIVersion
	return h
}

func (a *PolarAPI) Setup(ctx context.Context, key string, test bool, hookURL string) (Setup, error) {
	var out struct {
		ID             string `json:"id"`
		Secret         string `json:"secret"`
		OrganizationID string `json:"organization_id"`
	}
	body := map[string]any{"url": hookURL, "format": "raw", "events": PolarEvents, "api_version": PolarAPIVersion, "name": "trckable"}
	if err := call(ctx, "POST", a.base(test)+"/v1/webhooks/endpoints", polarHdr(key), jsonBody(body), &out); err != nil {
		return Setup{}, err
	}
	return Setup{RemoteID: out.ID, Secret: out.Secret, AccountRef: out.OrganizationID, Label: "Polar", Test: test}, nil
}

func (a *PolarAPI) Teardown(ctx context.Context, key string, test bool, s Setup) error {
	if s.RemoteID == "" {
		return nil
	}
	return call(ctx, "DELETE", a.base(test)+"/v1/webhooks/endpoints/"+url.PathEscape(s.RemoteID), polarHdr(key), nil, nil)
}

func (a *PolarAPI) Sync(ctx context.Context, key string, test bool, _ Setup, since time.Time) ([]Raw, error) {
	var out []Raw
	for page := 1; page <= 500; page++ {
		q := url.Values{"limit": {"100"}, "page": {fmt.Sprint(page)}, "sorting": {"-created_at"}, "created_after": {since.UTC().Format(time.RFC3339)}}
		var list struct {
			Items      []json.RawMessage `json:"items"`
			Pagination struct {
				MaxPage int `json:"max_page"`
			} `json:"pagination"`
		}
		if err := call(ctx, "GET", a.base(test)+"/v1/orders/?"+q.Encode(), polarHdr(key), nil, &list); err != nil {
			return out, err
		}
		for _, raw := range list.Items {
			body, _ := json.Marshal(map[string]any{"type": "order.updated", "data": raw})
			if ev, err := (polar{}).Parse(body); err == nil {
				out = append(out, Raw{Key: "sync:" + ev.Key, Body: body})
			}
		}
		if page >= list.Pagination.MaxPage || len(list.Items) == 0 {
			break
		}
	}
	return out, nil
}

// ---------------------------------------------------------------- Paddle

// PaddleAPI talks to api.paddle.com (sandbox-api.paddle.com for sandbox keys).
type PaddleAPI struct{ BaseURL, SandboxURL string }

func (a *PaddleAPI) base(key string, test bool) string {
	sandbox := test || strings.HasPrefix(key, "pdl_sdbx_")
	switch {
	case sandbox && a.SandboxURL != "":
		return a.SandboxURL
	case sandbox:
		return "https://sandbox-api.paddle.com"
	case a.BaseURL != "":
		return a.BaseURL
	}
	return "https://api.paddle.com"
}

func paddleHdr(key string) map[string]string {
	h := bearer(key)
	h["Content-Type"] = "application/json"
	h["Paddle-Version"] = "1"
	return h
}

func (a *PaddleAPI) Setup(ctx context.Context, key string, test bool, hookURL string) (Setup, error) {
	body := map[string]any{"description": "trckable revenue attribution", "type": "url", "destination": hookURL,
		"subscribed_events": PaddleEvents, "api_version": 1, "traffic_source": "all"}
	var out struct {
		Data struct {
			ID                string `json:"id"`
			EndpointSecretKey string `json:"endpoint_secret_key"`
		} `json:"data"`
	}
	if err := call(ctx, "POST", a.base(key, test)+"/notification-settings", paddleHdr(key), jsonBody(body), &out); err != nil {
		return Setup{}, err
	}
	return Setup{RemoteID: out.Data.ID, Secret: out.Data.EndpointSecretKey, Label: "Paddle", Test: test || strings.HasPrefix(key, "pdl_sdbx_")}, nil
}

func (a *PaddleAPI) Teardown(ctx context.Context, key string, test bool, s Setup) error {
	if s.RemoteID == "" {
		return nil
	}
	return call(ctx, "DELETE", a.base(key, test)+"/notification-settings/"+url.PathEscape(s.RemoteID), paddleHdr(key), nil, nil)
}

func (a *PaddleAPI) Sync(ctx context.Context, key string, test bool, _ Setup, since time.Time) ([]Raw, error) {
	var out []Raw
	next := a.base(key, test) + "/transactions?" + url.Values{"status": {"completed"}, "updated_at[GTE]": {since.UTC().Format(time.RFC3339)}, "per_page": {"30"}, "order_by": {"updated_at[ASC]"}}.Encode()
	for page := 0; next != "" && page < 1000; page++ {
		var list struct {
			Data []json.RawMessage `json:"data"`
			Meta struct {
				Pagination struct {
					Next    string `json:"next"`
					HasMore bool   `json:"has_more"`
				} `json:"pagination"`
			} `json:"meta"`
		}
		if err := call(ctx, "GET", next, paddleHdr(key), nil, &list); err != nil {
			return out, err
		}
		for _, raw := range list.Data {
			var t struct {
				ID        string `json:"id"`
				UpdatedAt string `json:"updated_at"`
			}
			json.Unmarshal(raw, &t)
			body, _ := json.Marshal(map[string]any{"event_id": "sync:" + t.ID + ":" + t.UpdatedAt, "event_type": "transaction.completed", "occurred_at": t.UpdatedAt, "data": raw})
			out = append(out, Raw{Key: "sync:" + t.ID + ":" + t.UpdatedAt, Body: body})
		}
		next = ""
		if list.Meta.Pagination.HasMore {
			next = list.Meta.Pagination.Next
		}
	}
	// Adjustments have no date filter: newest first, stop at the window.
	next = a.base(key, test) + "/adjustments?" + url.Values{"per_page": {"50"}}.Encode()
	for page := 0; next != "" && page < 200; page++ {
		var list struct {
			Data []json.RawMessage `json:"data"`
			Meta struct {
				Pagination struct {
					Next    string `json:"next"`
					HasMore bool   `json:"has_more"`
				} `json:"pagination"`
			} `json:"meta"`
		}
		if err := call(ctx, "GET", next, paddleHdr(key), nil, &list); err != nil {
			return out, err
		}
		old := false
		for _, raw := range list.Data {
			var a struct {
				ID        string `json:"id"`
				UpdatedAt string `json:"updated_at"`
				CreatedAt string `json:"created_at"`
			}
			json.Unmarshal(raw, &a)
			if t := rfc3339ms(a.UpdatedAt); t != 0 && t < since.UnixMilli() {
				old = true
				continue
			}
			k := "sync:" + a.ID + ":" + a.UpdatedAt
			body, _ := json.Marshal(map[string]any{"event_id": k, "event_type": "adjustment.updated", "occurred_at": a.UpdatedAt, "data": raw})
			out = append(out, Raw{Key: k, Body: body})
		}
		next = ""
		if list.Meta.Pagination.HasMore && !old {
			next = list.Meta.Pagination.Next
		}
	}
	return out, nil
}

// ------------------------------------------------------------------ Dodo

// DodoAPI talks to live.dodopayments.com (test.dodopayments.com in test mode).
type DodoAPI struct{ BaseURL, TestURL string }

func (a *DodoAPI) base(test bool) string {
	switch {
	case test && a.TestURL != "":
		return a.TestURL
	case test:
		return "https://test.dodopayments.com"
	case a.BaseURL != "":
		return a.BaseURL
	}
	return "https://live.dodopayments.com"
}

func dodoHdr(key string) map[string]string {
	h := bearer(key)
	h["Content-Type"] = "application/json"
	return h
}

func (a *DodoAPI) Setup(ctx context.Context, key string, test bool, hookURL string) (Setup, error) {
	var hook struct {
		ID string `json:"id"`
	}
	body := map[string]any{"url": hookURL, "description": "trckable revenue attribution", "filter_types": DodoEvents}
	if err := call(ctx, "POST", a.base(test)+"/webhooks", dodoHdr(key), jsonBody(body), &hook); err != nil {
		return Setup{}, err
	}
	var sec struct {
		Secret string `json:"secret"`
	}
	if err := call(ctx, "GET", a.base(test)+"/webhooks/"+url.PathEscape(hook.ID)+"/secret", dodoHdr(key), nil, &sec); err != nil {
		return Setup{}, err
	}
	return Setup{RemoteID: hook.ID, Secret: sec.Secret, Label: "Dodo Payments", Test: test}, nil
}

func (a *DodoAPI) Teardown(ctx context.Context, key string, test bool, s Setup) error {
	if s.RemoteID == "" {
		return nil
	}
	return call(ctx, "DELETE", a.base(test)+"/webhooks/"+url.PathEscape(s.RemoteID), dodoHdr(key), nil, nil)
}

// Sync lists succeeded payments, refunds and disputes. List items omit tax,
// so each payment is fetched in full (a few calls a day at most).
func (a *DodoAPI) Sync(ctx context.Context, key string, test bool, _ Setup, since time.Time) ([]Raw, error) {
	var out []Raw
	from := since.UTC().Format(time.RFC3339)
	lists := []struct {
		path, event, idField string
		query                url.Values
	}{
		{"/payments", "payment.succeeded", "payment_id", url.Values{"status": {"succeeded"}}},
		{"/refunds", "refund.succeeded", "refund_id", url.Values{"status": {"succeeded"}}},
		{"/disputes", "", "dispute_id", url.Values{}},
	}
	for _, l := range lists {
		for page := 0; page < 500; page++ {
			q := l.query
			q.Set("created_at_gte", from)
			q.Set("page_size", "100")
			q.Set("page_number", fmt.Sprint(page)) // 0-based
			var list struct {
				Items []json.RawMessage `json:"items"`
			}
			if err := call(ctx, "GET", a.base(test)+l.path+"?"+q.Encode(), dodoHdr(key), nil, &list); err != nil {
				return out, err
			}
			for _, raw := range list.Items {
				var o map[string]any
				json.Unmarshal(raw, &o)
				id, _ := o[l.idField].(string)
				data := raw
				event := l.event
				if l.path == "/payments" {
					var full json.RawMessage
					if err := call(ctx, "GET", a.base(test)+"/payments/"+url.PathEscape(id), dodoHdr(key), nil, &full); err == nil {
						data = full
					}
				}
				if l.path == "/disputes" {
					st, _ := o["dispute_status"].(string)
					event = "dispute." + strings.TrimPrefix(st, "dispute_")
				}
				ts, _ := o["created_at"].(string)
				body, _ := json.Marshal(map[string]any{"type": event, "timestamp": ts, "data": data})
				k := fmt.Sprintf("sync:%s:%s:%v", event, id, o["status"])
				if l.path == "/disputes" {
					k = fmt.Sprintf("sync:%s:%s", event, id)
				}
				out = append(out, Raw{Key: k, Body: body})
			}
			if len(list.Items) < 100 {
				break
			}
		}
	}
	return out, nil
}
