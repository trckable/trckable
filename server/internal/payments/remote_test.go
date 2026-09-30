package payments

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeAPI is a provider API recorded as request → answer. Every answer below
// is shaped like the provider's documented response (URLs next to each).
type fakeAPI struct {
	t     *testing.T
	mu    sync.Mutex
	calls []string // "METHOD /path?query"
	route func(w http.ResponseWriter, r *http.Request, body []byte)
	srv   *httptest.Server
}

func newFake(t *testing.T, route func(w http.ResponseWriter, r *http.Request, body []byte)) *fakeAPI {
	f := &fakeAPI{t: t, route: route}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		f.mu.Lock()
		f.calls = append(f.calls, r.Method+" "+r.URL.RequestURI())
		f.mu.Unlock()
		f.route(w, r, b)
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeAPI) called(prefix string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	for _, c := range f.calls {
		if strings.HasPrefix(c, prefix) {
			n++
		}
	}
	return n
}

// noWait replaces the retry sleep and records what it was asked to wait.
func noWait(t *testing.T) *[]time.Duration {
	var waits []time.Duration
	old := RetryWait
	RetryWait = func(_ context.Context, d time.Duration) error { waits = append(waits, d); return nil }
	t.Cleanup(func() { RetryWait = old })
	return &waits
}

func jsonAnswer(w http.ResponseWriter, code int, body string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_, _ = io.WriteString(w, body) //nolint:gosec // a test server answering fixed JSON; a failed write shows up as the client's error
}

var since = time.Date(2026, 9, 20, 0, 0, 0, 0, time.UTC)

// ---- retries (all providers share call) ----

// A rate limit is waited out (the provider's Retry-After first), a server
// error on a read is retried, a server error on a create is not (it may have
// created the endpoint), and a revoked key fails at once.
func TestProviderCallsRetryOnlyWhatIsSafe(t *testing.T) {
	waits := noWait(t)
	n := 0
	f := newFake(t, func(w http.ResponseWriter, r *http.Request, _ []byte) {
		n++
		switch r.URL.Path {
		case "/limited":
			if n < 3 {
				w.Header().Set("Retry-After", "7")
				jsonAnswer(w, 429, `{"error":{"message":"Too many requests"}}`)
				return
			}
			jsonAnswer(w, 200, `{"ok":true}`)
		case "/flaky":
			if n < 2 {
				jsonAnswer(w, 503, `{"error":"unavailable"}`)
				return
			}
			jsonAnswer(w, 200, `{"ok":true}`)
		case "/create":
			jsonAnswer(w, 502, `{"error":"bad gateway"}`)
		case "/revoked":
			jsonAnswer(w, 401, `{"error":{"message":"Invalid API Key provided: rk_live_****1234"}}`)
		}
	})
	ctx := context.Background()
	var out struct{ OK bool }
	if err := call(ctx, "GET", f.srv.URL+"/limited", nil, nil, &out); err != nil || !out.OK {
		t.Fatalf("rate limited read: %v", err)
	}
	if len(*waits) != 2 || (*waits)[0] != 7*time.Second {
		t.Fatalf("waits: %v, want the provider's Retry-After (7s) twice", *waits)
	}
	n, *waits = 0, nil
	if err := call(ctx, "GET", f.srv.URL+"/flaky", nil, nil, &out); err != nil {
		t.Fatalf("a 503 on a read must be retried: %v", err)
	}
	if len(*waits) != 1 || (*waits)[0] != time.Second {
		t.Fatalf("backoff: %v", *waits)
	}
	n = 0
	err := call(ctx, "POST", f.srv.URL+"/create", nil, strings.NewReader(`{}`), nil)
	var apiErr *APIError
	if !errors.As(err, &apiErr) || apiErr.Status != 502 || f.called("POST /create") != 1 {
		t.Fatalf("a failed create must not be sent twice: %v, %d calls", err, f.called("POST /create"))
	}
	n = 0
	err = call(ctx, "GET", f.srv.URL+"/revoked", nil, nil, nil)
	if !errors.As(err, &apiErr) || apiErr.Status != 401 || f.called("GET /revoked") != 1 || !strings.Contains(err.Error(), "Invalid API Key") {
		t.Fatalf("a revoked key: %v after %d calls", err, f.called("GET /revoked"))
	}
	// A rate limit that never ends gives up after maxAttempts.
	f.route = func(w http.ResponseWriter, _ *http.Request, _ []byte) { jsonAnswer(w, 429, `{}`) }
	if err := call(ctx, "GET", f.srv.URL+"/x", nil, nil, nil); err == nil || f.called("GET /x") != maxAttempts {
		t.Fatalf("endless 429: %v after %d calls", err, f.called("GET /x"))
	}
}

// ---- Stripe ----

// https://docs.stripe.com/api/webhook_endpoints/create,
// https://docs.stripe.com/api/events/list (newest first, starting_after).
func TestStripeRemote(t *testing.T) {
	noWait(t)
	evt := func(id string) string {
		return fmt.Sprintf(`{"id":%q,"object":"event","type":"payment_intent.succeeded","created":1758600000,"livemode":false,"data":{"object":{"id":"pi_%s","object":"payment_intent","amount_received":100,"currency":"usd"}}}`, id, id)
	}
	f := newFake(t, func(w http.ResponseWriter, r *http.Request, body []byte) {
		if r.Header.Get("Stripe-Version") != StripeAPIVersion {
			t.Errorf("unpinned API version: %q", r.Header.Get("Stripe-Version"))
		}
		switch {
		case r.Header.Get("Authorization") == "Bearer rk_live_readonly":
			jsonAnswer(w, 403, `{"error":{"message":"The provided key 'rk_live_****only' does not have the required permissions for this endpoint on account 'acct_1'. Having the 'rak_webhook_write' permission would allow this request to continue.","type":"invalid_request_error"}}`)
		case r.Method == "POST" && r.URL.Path == "/v1/webhook_endpoints":
			jsonAnswer(w, 200, `{"id":"we_new","object":"webhook_endpoint","secret":"whsec_new","livemode":false,"url":"https://stats.example/webhooks/stripe/pc_1","status":"enabled"}`)
		case r.URL.Path == "/v1/account":
			jsonAnswer(w, 500, `{"error":{"message":"account lookup down"}}`) // the label is optional
		case r.URL.Path == "/v1/webhook_endpoints" && r.URL.Query().Get("starting_after") == "":
			jsonAnswer(w, 200, `{"object":"list","has_more":true,"data":[{"id":"we_a","url":"https://stats.example/webhooks/stripe/pc_old"}]}`)
		case r.URL.Path == "/v1/webhook_endpoints":
			jsonAnswer(w, 200, `{"object":"list","has_more":false,"data":[{"id":"we_b","url":"https://other.example/hook"}]}`)
		case r.URL.Path == "/v1/events":
			q := r.URL.Query()
			if q.Get("created[gte]") != fmt.Sprint(since.Unix()) || len(q["types[]"]) > 20 {
				t.Errorf("events query: %v", q)
			}
			switch {
			case q.Get("types[]") != StripeEvents[0]:
				jsonAnswer(w, 200, `{"object":"list","has_more":false,"data":[`+evt("evt_r")+`]}`)
			case q.Get("starting_after") == "":
				jsonAnswer(w, 200, `{"object":"list","has_more":true,"data":[`+evt("evt_3")+`,`+evt("evt_2")+`]}`)
			case q.Get("starting_after") == "evt_2":
				jsonAnswer(w, 200, `{"object":"list","has_more":false,"data":[`+evt("evt_1")+`]}`)
			default:
				t.Errorf("paged from %q", q.Get("starting_after"))
			}
		case r.Method == "DELETE":
			jsonAnswer(w, 200, `{"id":"we_new","deleted":true}`)
		default:
			jsonAnswer(w, 404, `{}`)
		}
	})
	api := &StripeAPI{BaseURL: f.srv.URL}
	ctx := context.Background()

	s, err := api.Setup(ctx, "sk_test_ok", false, "https://stats.example/webhooks/stripe/pc_1")
	if err != nil || s.RemoteID != "we_new" || s.Secret != "whsec_new" || !s.Test || s.Label != "Stripe" {
		t.Fatalf("setup with a test key: %+v %v", s, err)
	}
	if _, err := api.Setup(ctx, "rk_live_readonly", false, "https://x"); err == nil || !strings.Contains(err.Error(), "rak_webhook_write") {
		t.Fatalf("a key without webhook permission must say which permission: %v", err)
	}
	hooks, err := api.Hooks(ctx, "sk_test_ok", false, s)
	if err != nil || len(hooks) != 2 || hooks[0].URL != "https://stats.example/webhooks/stripe/pc_old" {
		t.Fatalf("hooks over two pages: %+v %v", hooks, err)
	}
	raws, err := api.Sync(ctx, "sk_test_ok", false, s, since)
	if err != nil || len(raws) != 4 {
		t.Fatalf("sync: %d raws, %v", len(raws), err)
	}
	for _, r := range raws {
		ev, err := (stripe{}).Parse(r.Body)
		if err != nil || ev.Key != r.Key || len(ev.Payments) != 1 {
			t.Fatalf("a synced body must parse like the webhook it replaces: %+v %v", ev, err)
		}
	}
	if err := api.Teardown(ctx, "sk_test_ok", false, s); err != nil || f.called("DELETE /v1/webhook_endpoints/we_new") != 1 {
		t.Fatalf("teardown: %v", err)
	}
}

// ---- Lemon Squeezy ----

// https://docs.lemonsqueezy.com/api/webhooks/create-webhook,
// https://docs.lemonsqueezy.com/api/orders/list-all-orders (JSON:API, newest first).
func TestLemonSqueezyRemote(t *testing.T) {
	noWait(t)
	testHookFails, noStores := false, false
	order := func(id, created string) string {
		return fmt.Sprintf(`{"type":"orders","id":%q,"attributes":{"store_id":1,"customer_id":5,"user_email":"a@b.c","currency":"USD","tax":0,"total":900,"refunded_amount":0,"status":"paid","created_at":%q,"updated_at":%q,"test_mode":false}}`, id, created, created)
	}
	f := newFake(t, func(w http.ResponseWriter, r *http.Request, body []byte) {
		switch {
		case r.URL.Path == "/v1/stores":
			if noStores {
				jsonAnswer(w, 200, `{"data":[]}`)
				return
			}
			jsonAnswer(w, 200, `{"data":[{"type":"stores","id":"1","attributes":{"name":"Acme Store"}}]}`)
		case r.Method == "POST" && r.URL.Path == "/v1/webhooks":
			var in struct {
				Data struct {
					Attributes struct {
						Secret   string   `json:"secret"`
						TestMode bool     `json:"test_mode"`
						Events   []string `json:"events"`
					} `json:"attributes"`
				} `json:"data"`
			}
			if err := json.Unmarshal(body, &in); err != nil {
				t.Errorf("webhook request body: %v", err)
			}
			if n := len(in.Data.Attributes.Secret); n < 6 || n > 40 {
				t.Errorf("secret length %d outside Lemon Squeezy's 6–40", n)
			}
			if in.Data.Attributes.TestMode {
				if testHookFails {
					jsonAnswer(w, 422, `{"errors":[{"title":"Unprocessable Entity","detail":"The url has already been taken."}]}`)
					return
				}
				jsonAnswer(w, 201, `{"data":{"type":"webhooks","id":"12"}}`)
				return
			}
			jsonAnswer(w, 201, `{"data":{"type":"webhooks","id":"11"}}`)
		case r.URL.Path == "/v1/webhooks":
			jsonAnswer(w, 200, `{"meta":{"page":{"lastPage":1}},"data":[{"type":"webhooks","id":"3","attributes":{"url":"https://stats.example/webhooks/lemonsqueezy/pc_old"}}]}`)
		case r.URL.Path == "/v1/orders":
			if r.URL.Query().Get("filter[store_id]") != "1" {
				t.Errorf("orders not filtered by store: %v", r.URL.Query())
			}
			if r.URL.Query().Get("page[number]") == "1" {
				jsonAnswer(w, 200, `{"meta":{"page":{"lastPage":3}},"data":[`+order("103", "2026-09-25T10:00:00.000000Z")+`,`+order("102", "2026-09-22T10:00:00.000000Z")+`]}`)
				return
			}
			// Page 2 reaches back past `since`: page 3 is never asked for.
			jsonAnswer(w, 200, `{"meta":{"page":{"lastPage":3}},"data":[`+order("101", "2026-09-21T10:00:00.000000Z")+`,`+order("100", "2026-09-01T10:00:00.000000Z")+`]}`)
		case r.URL.Path == "/v1/subscription-invoices":
			jsonAnswer(w, 200, `{"meta":{"page":{"lastPage":1}},"data":[{"type":"subscription-invoices","id":"7002","attributes":{"store_id":1,"subscription_id":900,"customer_id":5,"billing_reason":"renewal","currency":"USD","tax":0,"total":900,"refunded_amount":0,"status":"paid","created_at":"2026-09-24T10:00:00.000000Z","updated_at":"2026-09-24T10:00:00.000000Z","test_mode":false}},{"type":"subscription-invoices","id":"7001","attributes":{"billing_reason":"initial","status":"paid","total":900,"currency":"USD","created_at":"2026-09-23T10:00:00.000000Z","updated_at":"2026-09-23T10:00:00.000000Z"}}]}`)
		case r.Method == "DELETE":
			w.WriteHeader(204)
		}
	})
	api := &LemonSqueezyAPI{BaseURL: f.srv.URL}
	ctx := context.Background()
	s, err := api.Setup(ctx, "ls_key", false, "https://stats.example/webhooks/lemonsqueezy/pc_1")
	if err != nil || s.RemoteID != "11,12" || s.AccountRef != "1" || s.Label != "Acme Store" {
		t.Fatalf("setup: %+v %v", s, err)
	}
	// The test-mode webhook is a nice-to-have: live events still arrive.
	testHookFails = true
	if s2, err := api.Setup(ctx, "ls_key", false, "https://x"); err != nil || s2.RemoteID != "11" {
		t.Fatalf("partial setup: %+v %v", s2, err)
	}
	noStores = true
	if _, err := api.Setup(ctx, "ls_key", false, "https://x"); err == nil || !strings.Contains(err.Error(), "no stores") {
		t.Fatalf("a key without stores: %v", err)
	}
	if hooks, err := api.Hooks(ctx, "ls_key", false, s); err != nil || len(hooks) != 1 || hooks[0].ID != "3" {
		t.Fatalf("hooks: %+v %v", hooks, err)
	}
	raws, err := api.Sync(ctx, "ls_key", false, s, since)
	if err != nil {
		t.Fatal(err)
	}
	ids := []string{}
	for _, r := range raws {
		ev, _ := (lemonSqueezy{}).Parse(r.Body)
		if ev.Key != r.Key {
			t.Errorf("sync key %q differs from the webhook key %q", r.Key, ev.Key)
		}
		for _, p := range ev.Payments {
			ids = append(ids, p.ID)
		}
	}
	if strings.Join(ids, ",") != "order:103,order:102,order:101,sinv:7002" {
		t.Fatalf("synced payments: %v", ids)
	}
	if f.called("GET /v1/orders?") != 2 {
		t.Fatalf("paged past since: %d order pages", f.called("GET /v1/orders?"))
	}
	if err := api.Teardown(ctx, "ls_key", false, s); err != nil || f.called("DELETE /v1/webhooks/") != 2 {
		t.Fatalf("teardown of both webhooks: %v", err)
	}
}

// ---- Polar ----

// https://polar.sh/docs/api-reference/webhooks/endpoints/create,
// https://polar.sh/docs/api-reference/orders/list,
// https://polar.sh/docs/api-reference/refunds/list.
func TestPolarRemote(t *testing.T) {
	noWait(t)
	live := newFake(t, func(w http.ResponseWriter, r *http.Request, _ []byte) {
		t.Errorf("sandbox call went to live: %s", r.URL)
	})
	f := newFake(t, func(w http.ResponseWriter, r *http.Request, body []byte) {
		switch {
		case r.Method == "POST" && r.URL.Path == "/v1/webhooks/endpoints":
			var in map[string]any
			if err := json.Unmarshal(body, &in); err != nil {
				t.Errorf("endpoint request body: %v", err)
			}
			if in["format"] != "raw" {
				t.Errorf("endpoint format: %v", in["format"])
			}
			jsonAnswer(w, 201, `{"id":"wh_1","url":"https://stats.example/webhooks/polar/pc_1","format":"raw","secret":"polar_whs_abc","organization_id":"org_1","events":["order.paid"]}`)
		case r.URL.Path == "/v1/webhooks/endpoints":
			jsonAnswer(w, 200, `{"items":[{"id":"wh_0","url":"https://stats.example/webhooks/polar/pc_old"}],"pagination":{"total_count":1,"max_page":1}}`)
		case r.URL.Path == "/v1/orders/":
			if r.URL.Query().Get("created_after") != since.Format(time.RFC3339) {
				t.Errorf("orders query: %v", r.URL.Query())
			}
			jsonAnswer(w, 200, `{"items":[{"id":"ord_2","created_at":"2026-09-24T10:00:00Z","modified_at":"2026-09-24T10:00:00Z","status":"paid","paid":true,"tax_amount":0,"total_amount":1500,"refunded_amount":0,"refunded_tax_amount":0,"currency":"usd","billing_reason":"purchase","customer_id":"cus_1","metadata":{}}],"pagination":{"total_count":1,"max_page":1}}`)
		case r.URL.Path == "/v1/refunds/":
			if r.URL.Query().Get("page") == "1" {
				jsonAnswer(w, 200, `{"items":[{"id":"ref_2","order_id":"ord_old","amount":500,"tax_amount":100,"currency":"usd","status":"succeeded","created_at":"2026-09-25T10:00:00Z","modified_at":"2026-09-25T10:00:00Z"},{"id":"ref_1","order_id":"ord_older","amount":500,"tax_amount":0,"currency":"usd","status":"succeeded","created_at":"2026-08-01T10:00:00Z","modified_at":null}],"pagination":{"total_count":30,"max_page":3}}`)
				return
			}
			t.Errorf("refunds paged past since")
		}
	})
	api := &PolarAPI{BaseURL: live.srv.URL, SandboxURL: f.srv.URL}
	ctx := context.Background()
	s, err := api.Setup(ctx, "polar_oat_x", true, "https://stats.example/webhooks/polar/pc_1")
	if err != nil || s.Secret != "polar_whs_abc" || !s.Test || s.AccountRef != "org_1" {
		t.Fatalf("setup: %+v %v", s, err)
	}
	if hooks, err := api.Hooks(ctx, "polar_oat_x", true, s); err != nil || len(hooks) != 1 {
		t.Fatalf("hooks: %+v %v", hooks, err)
	}
	raws, err := api.Sync(ctx, "polar_oat_x", true, s, since)
	if err != nil || len(raws) != 2 {
		t.Fatalf("sync: %d %v", len(raws), err)
	}
	ev, _ := (polar{}).Parse(raws[1].Body)
	if len(ev.Refunds) != 1 || ev.Refunds[0].PaymentID != "ord_old" || ev.Refunds[0].Amount != 600 || ev.Refunds[0].Status != RefundSucceeded {
		t.Fatalf("a missed refund of an older order: %+v", ev)
	}
}

// ---- Paddle ----

// https://developer.paddle.com/api-reference/notification-settings/create-notification-setting,
// https://developer.paddle.com/api-reference/transactions/list-transactions,
// https://developer.paddle.com/api-reference/adjustments/list-adjustments (id[DESC] by default, no date filter).
func TestPaddleRemote(t *testing.T) {
	noWait(t)
	var sandbox *fakeAPI
	liveCalls := 0
	route := func(isSandbox bool) func(w http.ResponseWriter, r *http.Request, _ []byte) {
		return func(w http.ResponseWriter, r *http.Request, _ []byte) {
			if !isSandbox {
				liveCalls++
			}
			switch {
			case r.Method == "POST" && r.URL.Path == "/notification-settings":
				jsonAnswer(w, 201, `{"data":{"id":"ntfset_1","destination":"https://stats.example/webhooks/paddle/pc_1","endpoint_secret_key":"pdl_ntfset_01_secret","traffic_source":"all"}}`)
			case r.URL.Path == "/notification-settings":
				jsonAnswer(w, 200, `{"data":[{"id":"ntfset_0","destination":"https://stats.example/webhooks/paddle/pc_old"}]}`)
			case (r.URL.Path == "/transactions" || r.URL.Path == "/adjustments") && r.URL.Query().Get("per_page") == "1":
				jsonAnswer(w, 200, `{"data":[],"meta":{"pagination":{"per_page":1,"next":"","has_more":false}}}`) // the setup's probe
			case r.URL.Path == "/transactions" && r.URL.Query().Get("after") == "":
				if r.URL.Query().Get("updated_at[GTE]") != since.Format(time.RFC3339) || r.URL.Query().Get("status") != "completed" {
					t.Errorf("transactions query: %v", r.URL.Query())
				}
				jsonAnswer(w, 200, `{"data":[{"id":"txn_1","status":"completed","currency_code":"EUR","origin":"web","billed_at":"2026-09-21T10:00:00Z","updated_at":"2026-09-21T10:00:05Z","details":{"totals":{"tax":"190","total":"1190","grand_total":"1190"}}}],"meta":{"pagination":{"per_page":30,"next":"`+sandbox.srv.URL+`/transactions?after=txn_1","has_more":true}}}`)
			case r.URL.Path == "/transactions":
				jsonAnswer(w, 200, `{"data":[{"id":"txn_2","status":"completed","currency_code":"EUR","origin":"subscription_recurring","subscription_id":"sub_1","billed_at":"2026-09-22T10:00:00Z","updated_at":"2026-09-22T10:00:05Z","details":{"totals":{"tax":"0","total":"500","grand_total":"500"}}}],"meta":{"pagination":{"per_page":30,"next":"","has_more":false}}}`)
			case r.URL.Path == "/adjustments":
				if r.URL.Query().Get("order_by") != "id[DESC]" {
					t.Errorf("adjustments must be read newest first: %v", r.URL.Query())
				}
				jsonAnswer(w, 200, `{"data":[{"id":"adj_2","action":"refund","transaction_id":"txn_1","status":"approved","currency_code":"EUR","created_at":"2026-09-23T10:00:00Z","updated_at":"2026-09-23T11:00:00Z","totals":{"total":"595"}},{"id":"adj_1","action":"refund","transaction_id":"txn_0","status":"approved","currency_code":"EUR","created_at":"2026-08-01T10:00:00Z","updated_at":"2026-08-01T10:00:00Z","totals":{"total":"100"}}],"meta":{"pagination":{"next":"x","has_more":true}}}`)
			}
		}
	}
	sandbox = newFake(t, route(true))
	live := newFake(t, route(false))
	api := &PaddleAPI{BaseURL: live.srv.URL, SandboxURL: sandbox.srv.URL}
	ctx := context.Background()

	// The key says which environment it is, whatever mode was picked.
	s, err := api.Setup(ctx, "pdl_live_apikey_01", true, "https://stats.example/webhooks/paddle/pc_1")
	if err != nil || s.Test || liveCalls != 3 { // probe transactions, probe adjustments, create
		t.Fatalf("a live key with test picked: %+v %v (live calls %d)", s, err, liveCalls)
	}
	s, err = api.Setup(ctx, "pdl_sdbx_apikey_01", false, "https://stats.example/webhooks/paddle/pc_1")
	if err != nil || !s.Test || s.Secret != "pdl_ntfset_01_secret" || liveCalls != 3 {
		t.Fatalf("a sandbox key: %+v %v", s, err)
	}
	if hooks, err := api.Hooks(ctx, "pdl_sdbx_apikey_01", false, s); err != nil || len(hooks) != 1 || hooks[0].URL != "https://stats.example/webhooks/paddle/pc_old" {
		t.Fatalf("hooks: %+v %v", hooks, err)
	}
	raws, err := api.Sync(ctx, "pdl_sdbx_apikey_01", false, s, since)
	if err != nil || len(raws) != 3 {
		t.Fatalf("sync: %d %v", len(raws), err)
	}
	if sandbox.called("GET /adjustments") != 2 { // the setup's probe, then one page of the sync
		t.Fatal("paged adjustments past since")
	}
	pay, _ := (paddle{}).Parse(raws[1].Body)
	adj, _ := (paddle{}).Parse(raws[2].Body)
	if len(pay.Payments) != 1 || pay.Payments[0].Kind != KindRenewal || len(adj.Refunds) != 1 || adj.Refunds[0].Amount != 595 {
		t.Fatalf("synced facts: %+v %+v", pay, adj)
	}
}

// ---- Dodo ----

// https://docs.dodopayments.com/api-reference/webhooks/create-webhook,
// https://docs.dodopayments.com/api-reference/webhooks/get-webhook-secret,
// https://docs.dodopayments.com/api-reference/payments/get-payments (page_number is 0-based).
func TestDodoRemote(t *testing.T) {
	noWait(t)
	secretFails := false
	f := newFake(t, func(w http.ResponseWriter, r *http.Request, _ []byte) {
		switch {
		case r.Method == "POST" && r.URL.Path == "/webhooks":
			jsonAnswer(w, 200, `{"id":"wh_d1","url":"https://stats.example/webhooks/dodo/pc_1","filter_types":["payment.succeeded"]}`)
		case r.URL.Path == "/webhooks/wh_d1/secret":
			if secretFails {
				jsonAnswer(w, 403, `{"message":"Forbidden"}`)
				return
			}
			jsonAnswer(w, 200, `{"secret":"whsec_ZG9kby1zZWNyZXQtZm9yLXRlc3Rz"}`)
		case r.Method == "DELETE" && r.URL.Path == "/webhooks/wh_d1":
			w.WriteHeader(200)
		case r.URL.Path == "/webhooks":
			jsonAnswer(w, 200, `{"data":[{"id":"wh_d0","url":"https://stats.example/webhooks/dodo/pc_old"}],"done":true,"iterator":null}`)
		case r.URL.Path == "/payments" && r.URL.Query().Get("page_number") == "0":
			items := make([]string, 100) // a full page: there is another
			for i := range items {
				items[i] = fmt.Sprintf(`{"payment_id":"pay_%d","status":"succeeded","total_amount":1000,"currency":"USD","created_at":"2026-09-22T10:00:00Z"}`, i)
			}
			jsonAnswer(w, 200, `{"items":[`+strings.Join(items, ",")+`]}`)
		case r.URL.Path == "/payments" && r.URL.Query().Get("page_number") == "1":
			jsonAnswer(w, 200, `{"items":[]}`)
		case strings.HasPrefix(r.URL.Path, "/payments/"):
			id := strings.TrimPrefix(r.URL.Path, "/payments/")
			jsonAnswer(w, 200, `{"payment_id":"`+id+`","status":"succeeded","total_amount":1000,"tax":100,"currency":"USD","created_at":"2026-09-22T10:00:00Z","customer":{"customer_id":"cus_1","email":"a@b.c"},"metadata":{}}`)
		case r.URL.Path == "/refunds":
			jsonAnswer(w, 200, `{"items":[{"refund_id":"ref_1","payment_id":"pay_1","amount":500,"currency":"USD","status":"succeeded","created_at":"2026-09-23T10:00:00Z"}]}`)
		case r.URL.Path == "/disputes":
			jsonAnswer(w, 200, `{"items":[{"dispute_id":"dsp_1","payment_id":"pay_2","amount":"1000","currency":"USD","dispute_status":"dispute_lost","created_at":"2026-09-24T10:00:00Z"}]}`)
		}
	})
	api := &DodoAPI{TestURL: f.srv.URL}
	ctx := context.Background()
	s, err := api.Setup(ctx, "dodo_test_key", true, "https://stats.example/webhooks/dodo/pc_1")
	if err != nil || s.Secret == "" || !s.Test {
		t.Fatalf("setup: %+v %v", s, err)
	}
	secretFails = true
	if _, err := api.Setup(ctx, "dodo_test_key", true, "https://x"); err == nil || f.called("DELETE /webhooks/wh_d1") != 1 {
		t.Fatalf("a setup whose secret can't be read must remove its webhook: %v", err)
	}
	if hooks, err := api.Hooks(ctx, "dodo_test_key", true, s); err != nil || len(hooks) != 1 {
		t.Fatalf("hooks: %+v %v", hooks, err)
	}
	raws, err := api.Sync(ctx, "dodo_test_key", true, s, since)
	if err != nil || len(raws) != 102 {
		t.Fatalf("sync: %d %v", len(raws), err)
	}
	var tax, refunds, lost int
	for _, r := range raws {
		ev, err := (dodo{}).Parse(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		for _, p := range ev.Payments {
			if p.Tax != nil && *p.Tax == 100 {
				tax++
			}
		}
		refunds += len(ev.Refunds)
		for _, d := range ev.Disputes {
			if d.Status == DisputeLost && d.Amount == 1000 {
				lost++
			}
		}
	}
	if tax != 100 || refunds != 1 || lost != 1 {
		t.Fatalf("synced: %d payments with tax, %d refunds, %d lost disputes", tax, refunds, lost)
	}
}
