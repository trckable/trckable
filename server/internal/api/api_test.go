package api

import (
	"bufio"
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/ledger"
	"github.com/trckable/trckable/server/internal/payments"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/realtime"
	"github.com/trckable/trckable/server/internal/revenue"
	"github.com/trckable/trckable/server/internal/secrets"
	"github.com/trckable/trckable/server/internal/store/duck"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/wal"
	"github.com/trckable/trckable/server/internal/writer"
)

type rig struct {
	rev  *revenue.Service
	srv  *httptest.Server
	ctl  *sqlite.Store
	log  *wal.Log
	w    *writer.Writer
	site string
	now  time.Time
	api  *API
}

func newRig(t *testing.T) *rig {
	t.Helper()
	ctx := context.Background()
	dir := t.TempDir()
	ctl, err := sqlite.Open(ctx, filepath.Join(dir, "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	st, err := duck.Open(ctx, filepath.Join(dir, "trckable.duckdb"), duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	lg, _ := wal.Open(filepath.Join(dir, "wal"), wal.Options{NoSync: true})
	now := time.Date(2026, 9, 22, 12, 0, 0, 0, time.UTC)
	hub := realtime.New()
	w := writer.New(lg, st, writer.Options{FlushEvery: 5 * time.Millisecond, IdleClose: 20 * time.Millisecond, Now: func() time.Time { return now }})
	w.OnCommit = hub.Publish
	wctx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() { w.Run(wctx); close(done) }()
	site, _ := ctl.CreateSite(ctx, sqlite.DefaultAccount, "site.com", "")
	box, _ := secrets.New([]byte("api test instance key"))
	rev, err := revenue.New(ctx, ctl.DB, box)
	if err != nil {
		t.Fatal(err)
	}
	a := &API{Ctl: ctl, Hub: hub, Token: "automation-token", SetupEnv: "tkb_setup_test", Now: func() time.Time { return now }, Revenue: rev, Box: box,
		PurgeAnalytics: w.PurgeSite,
		ErasePerson:    w.ErasePerson,
		Query: func() *query.Q {
			if !w.Ready() {
				return nil
			}
			return &query.Q{DB: st.DB, Open: w.OpenSessions, Payments: func(ctx context.Context, site, cur string, from, to time.Time, test bool) ([]ledger.Fact, bool, error) {
				if !rev.Enabled(ctx, site) {
					return nil, false, nil
				}
				f, err := rev.Facts(ctx, site, cur, from, to, test)
				return f, true, err
			}}
		}}
	mux := http.NewServeMux()
	a.Routes(mux)
	rev.OnChange = a.PurgeSite
	mux.HandleFunc("POST /webhooks/{provider}/{conn}", rev.Webhook)
	srv := httptest.NewServer(mux)
	t.Cleanup(func() {
		srv.Close()
		cancel()
		<-done
		lg.Close()
		st.Close()
		ctl.Close()
	})
	return &rig{rev: rev, srv: srv, ctl: ctl, log: lg, w: w, site: site, now: now, api: a}
}

func (g *rig) event(t *testing.T, e event.Event) {
	t.Helper()
	e.Site = g.site
	b, _ := e.Marshal()
	if _, err := g.log.Append(context.Background(), b); err != nil {
		t.Fatal(err)
	}
}

func (g *rig) waitApplied(t *testing.T, n uint64) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for g.w.Applied() < n {
		if time.Now().After(deadline) {
			t.Fatalf("writer stuck at %d", g.w.Applied())
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func client() *http.Client {
	jar, _ := cookiejar.New(nil)
	return &http.Client{Jar: jar, Timeout: 5 * time.Second}
}

func do(t *testing.T, c *http.Client, method, url, body string, hdr ...string) (int, map[string]any) {
	t.Helper()
	req, _ := http.NewRequest(method, url, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for i := 0; i+1 < len(hdr); i += 2 {
		req.Header.Set(hdr[i], hdr[i+1])
	}
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

const csrf = "X-Trckable-Request"

func (g *rig) setup(t *testing.T, c *http.Client) {
	t.Helper()
	code, out := do(t, c, "POST", g.srv.URL+"/api/v1/setup", `{"token":"tkb_setup_test","email":"me@site.com","password":"correct horse battery"}`)
	if code != http.StatusCreated {
		t.Fatalf("setup: %d %v", code, out)
	}
}

func TestSetupIsGuardedAndOneShot(t *testing.T) {
	g := newRig(t)
	c := client()
	if _, out := do(t, c, "GET", g.srv.URL+"/api/v1/setup", ""); out["needs_setup"] != true {
		t.Fatalf("status: %v", out)
	}
	if code, _ := do(t, c, "POST", g.srv.URL+"/api/v1/setup", `{"token":"guess","email":"x@y.z","password":"correct horse battery"}`); code != http.StatusForbidden {
		t.Fatalf("wrong token: %d", code)
	}
	g.setup(t, c)
	if code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/setup", `{"token":"tkb_setup_test","email":"evil@y.z","password":"correct horse battery"}`); code != http.StatusConflict {
		t.Fatalf("second setup: %d", code)
	}
	if code, out := do(t, c, "GET", g.srv.URL+"/api/v1/me", ""); code != 200 || out["email"] != "me@site.com" {
		t.Fatalf("me after setup: %d %v", code, out)
	}
}

func TestAuthCSRFAndAPIKeys(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	anon := client()
	if code, _ := do(t, anon, "GET", g.srv.URL+"/api/v1/sites", ""); code != http.StatusUnauthorized {
		t.Fatalf("anonymous: %d", code)
	}
	// Cookie-authenticated writes need the custom header (CSRF).
	if code, _ := do(t, c, "POST", g.srv.URL+"/api/v1/keys", `{"name":"mcp"}`); code != http.StatusForbidden {
		t.Fatalf("POST without CSRF header: %d", code)
	}
	code, out := do(t, c, "POST", g.srv.URL+"/api/v1/keys", `{"name":"mcp"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("create key: %d %v", code, out)
	}
	secret := out["secret"].(string)
	keyID := out["key"].(map[string]any)["id"].(string)
	if code, out := do(t, anon, "GET", g.srv.URL+"/api/v1/sites", "", "Authorization", "Bearer "+secret); code != 200 || len(out["sites"].([]any)) != 1 {
		t.Fatalf("api key: %d %v", code, out)
	}
	for _, w := range [][2]string{{"POST", "/api/v1/keys"}, {"DELETE", "/api/v1/keys/" + keyID}, {"PATCH", "/api/v1/sites/" + g.site}, {"POST", "/api/v1/sites"}} {
		if code, _ := do(t, anon, w[0], g.srv.URL+w[1], `{"name":"x","domain":"evil.com","timezone":"UTC"}`, "Authorization", "Bearer "+secret); code != http.StatusForbidden {
			t.Fatalf("API key %s %s: %d, want 403 (keys are read-only)", w[0], w[1], code)
		}
	}
	if code, _ := do(t, anon, "GET", g.srv.URL+"/api/v1/sites", "", "Authorization", "Bearer automation-token"); code != 200 {
		t.Fatalf("automation token: %d", code)
	}
	do(t, c, "DELETE", g.srv.URL+"/api/v1/keys/"+keyID, "", csrf, "1")
	if code, _ := do(t, anon, "GET", g.srv.URL+"/api/v1/sites", "", "Authorization", "Bearer "+secret); code != http.StatusUnauthorized {
		t.Fatalf("revoked key: %d", code)
	}
	if code, _ := do(t, anon, "GET", g.srv.URL+"/api/v1/sites", "", "Authorization", "Bearer tkb_live_forged"); code != http.StatusUnauthorized {
		t.Fatalf("forged key: %d", code)
	}
}

func TestLoginIsRateLimited(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	codes := map[int]int{}
	for i := 0; i < 12; i++ {
		code, _ := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"wrong password"}`)
		codes[code]++
	}
	if codes[http.StatusTooManyRequests] == 0 || codes[http.StatusUnauthorized] != 10 {
		t.Fatalf("login attempts: %v", codes)
	}
}

func TestReportCompareAndFilters(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	day := func(d, h int) int64 { return time.Date(2026, 9, d, h, 0, 0, 0, time.UTC).UnixMilli() }
	n := uint64(0)
	add := func(e event.Event) { n++; e.EventID = n; g.event(t, e) }
	// Sep 20: 2 visitors (Search, AI). Sep 19: 1 visitor (Search).
	add(event.Event{Kind: event.KindPageview, TS: day(20, 9), Visitor: 1, Path: "/", Channel: "Search", Country: "DE"})
	add(event.Event{Kind: event.KindPageview, TS: day(20, 10), Visitor: 2, Path: "/pricing", Channel: "AI", Country: "US"})
	add(event.Event{Kind: event.KindPageview, TS: day(19, 9), Visitor: 3, Path: "/", Channel: "Search", Country: "DE"})
	g.waitApplied(t, n)

	code, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/report?from=2026-09-20&to=2026-09-20&compare=previous", "")
	if code != 200 {
		t.Fatalf("report: %d %v", code, out)
	}
	cur := out["current"].(map[string]any)["kpis"].(map[string]any)
	prev := out["previous"].(map[string]any)["kpis"].(map[string]any)
	if cur["visitors"].(float64) != 2 || prev["visitors"].(float64) != 1 || out["bucket"] != "hour" {
		t.Fatalf("compare: cur=%v prev=%v bucket=%v", cur, prev, out["bucket"])
	}
	if out["previous_from"] != "2026-09-19" || out["previous_to"] != "2026-09-19" {
		t.Fatalf("previous range: %v..%v", out["previous_from"], out["previous_to"])
	}
	_, out = do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/report?from=2026-09-19&to=2026-09-20&f=channel:Search", "")
	if v := out["current"].(map[string]any)["kpis"].(map[string]any)["visitors"].(float64); v != 2 {
		t.Fatalf("filtered visitors = %v", v)
	}
	if code, _ := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/report?f=password:x", ""); code != http.StatusBadRequest {
		t.Fatalf("bad filter dim: %d", code)
	}
	if code, _ := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/report?from=2026-09-21&to=2026-09-01", ""); code != http.StatusBadRequest {
		t.Fatalf("inverted range: %d", code)
	}
}

// Stop ends open live streams at once, so a redeploy is not held for the
// whole drain by a tab someone left open.
func TestStopEndsLiveStreams(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	c.Timeout = 0
	resp, err := c.Get(g.srv.URL + "/api/v1/sites/" + g.site + "/live")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	ended := make(chan struct{})
	go func() {
		io.Copy(io.Discard, resp.Body)
		close(ended)
	}()
	g.api.Stop()
	select {
	case <-ended:
	case <-time.After(3 * time.Second):
		t.Fatal("the stream outlived Stop")
	}
}

func TestLiveStreamDeliversVisits(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	req, _ := http.NewRequest("GET", g.srv.URL+"/api/v1/sites/"+g.site+"/live", nil)
	c.Timeout = 0
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("content type %q", ct)
	}
	lines := make(chan string, 64)
	go func() {
		sc := bufio.NewScanner(resp.Body)
		for sc.Scan() {
			lines <- sc.Text()
		}
		close(lines)
	}()
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 77, TS: g.now.UnixMilli(), Visitor: 5, Path: "/live-test", Channel: "AI", Country: "AL"})
	deadline := time.After(5 * time.Second)
	for {
		select {
		case l, ok := <-lines:
			if !ok {
				t.Fatal("stream closed")
			}
			if strings.HasPrefix(l, "data: ") && strings.Contains(l, "/live-test") {
				// The payload stays slim: geography and device, no IP, no path
				// parameters — plus the pseudonymous visitor id, which the
				// dashboard needs to open a journey (that module is on here).
				if !strings.Contains(l, `"country":"AL"`) || !strings.Contains(l, `"visitor":`) || strings.Contains(l, "ip") {
					t.Fatalf("live payload: %s", l)
				}
				return
			}
		case <-deadline:
			t.Fatal("no live visit received")
		}
	}
}

func TestRevenueEndToEnd(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	// Before any connection: no money block at all.
	_, out := do(t, c, "GET", base+"/report?from=2026-09-22&to=2026-09-22", "")
	if _, ok := out["current"].(map[string]any)["money"]; ok {
		t.Fatal("money shown before a provider is connected")
	}
	if code, _ := do(t, c, "POST", base+"/payments", `{"provider":"nope"}`, csrf, "1"); code != http.StatusBadRequest {
		t.Fatalf("unknown provider: %d", code)
	}
	// Manual setup: create the connection (its URL goes into Stripe), then paste the secret.
	code, conn := do(t, c, "POST", base+"/payments", `{"provider":"stripe"}`, csrf, "1")
	if code != http.StatusCreated || conn["has_secret"] != false {
		t.Fatalf("connect: %d %v", code, conn)
	}
	forged := []byte(`{"id":"evt_f","type":"payment_intent.succeeded","created":1,"livemode":true,"data":{"object":{"id":"pi_f","amount_received":100000,"currency":"usd"}}}`)
	fm := hmac.New(sha256.New, nil)
	fmt.Fprintf(fm, "%d.%s", time.Now().Unix(), forged)
	freq, _ := http.NewRequest("POST", g.srv.URL+"/webhooks/stripe/"+conn["id"].(string), bytes.NewReader(forged))
	freq.Header.Set("Stripe-Signature", fmt.Sprintf("t=%d,v1=%s", time.Now().Unix(), hex.EncodeToString(fm.Sum(nil))))
	if res, _ := http.DefaultClient.Do(freq); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("webhook signed with an empty key before the secret was set: %d", res.StatusCode)
	}
	if code, _ := do(t, c, "PATCH", base+"/payments/"+conn["id"].(string), `{"secret":"whsec_e2e"}`, csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("set secret: %d", code)
	}
	_, list := do(t, c, "GET", base+"/payments", "")
	if len(list["connections"].([]any)) != 1 || len(list["providers"].([]any)) != len(payments.Registry) {
		t.Fatalf("payments list: %v", list)
	}
	// A visit from an AI assistant, then a purchase.
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 1, TS: g.now.Add(-time.Hour).UnixMilli(), Visitor: 0x51, Path: "/pricing", Channel: "AI", RefHost: "chatgpt.com", Country: "DE"})
	g.waitApplied(t, 1)
	body := []byte(fmt.Sprintf(`{"id":"evt_x","type":"payment_intent.succeeded","created":%d,"livemode":true,
		"data":{"object":{"id":"pi_x","amount_received":11900,"currency":"usd","metadata":{"trckable_vid":"%s.abc"}}}}`, g.now.Unix(), strconv.FormatUint(0x51, 36)))
	cs := []byte(fmt.Sprintf(`{"id":"evt_cs","type":"checkout.session.completed","created":%d,"livemode":true,
		"data":{"object":{"id":"cs_x","mode":"payment","payment_intent":"pi_x","metadata":{},"total_details":{"amount_tax":1900}}}}`, g.now.Unix()))
	for _, b := range [][]byte{body, cs} {
		req, _ := http.NewRequest("POST", g.srv.URL+conn["webhook_url"].(string)[strings.Index(conn["webhook_url"].(string), "/webhooks/"):], bytes.NewReader(b))
		m := hmac.New(sha256.New, []byte("whsec_e2e"))
		fmt.Fprintf(m, "%d.%s", time.Now().Unix(), b)
		req.Header.Set("Stripe-Signature", fmt.Sprintf("t=%d,v1=%s", time.Now().Unix(), hex.EncodeToString(m.Sum(nil))))
		res, err := http.DefaultClient.Do(req)
		if err != nil || res.StatusCode != 200 {
			t.Fatalf("webhook: %v %v", res, err)
		}
		res.Body.Close()
	}
	g.rev.Process(context.Background())
	_, out = do(t, c, "GET", base+"/report?from=2026-09-22&to=2026-09-22&compare=previous", "")
	money := out["current"].(map[string]any)["money"].(map[string]any)
	if money["revenue"].(float64) != 10000 || money["paying_visitors"].(float64) != 1 || money["currency"] != "USD" {
		t.Fatalf("money: %v", money)
	}
	var ai map[string]any
	for _, r := range out["current"].(map[string]any)["dims"].(map[string]any)["channel"].([]any) {
		if r.(map[string]any)["value"] == "AI" {
			ai = r.(map[string]any)
		}
	}
	if ai == nil || ai["revenue"].(float64) != 10000 {
		t.Fatalf("AI channel revenue: %v", ai)
	}
	if prev := out["previous"].(map[string]any)["money"].(map[string]any); prev["revenue"].(float64) != 0 {
		t.Fatalf("previous period money: %v", prev)
	}
	// API keys can read revenue but never connect or disconnect providers.
	_, k := do(t, c, "POST", g.srv.URL+"/api/v1/keys", `{"name":"ro"}`, csrf, "1")
	anon := client()
	if code, _ := do(t, anon, "POST", base+"/payments", `{"provider":"stripe","secret":"x"}`, "Authorization", "Bearer "+k["secret"].(string)); code != http.StatusForbidden {
		t.Fatalf("API key connected a provider: %d", code)
	}
	if code, _ := do(t, anon, "GET", base+"/payments/"+conn["id"].(string)+"/secret", "", "Authorization", "Bearer automation-token"); code != http.StatusForbidden {
		t.Fatalf("token read a signing secret: %d", code)
	}
	if code, _ := do(t, c, "DELETE", base+"/payments/"+conn["id"].(string), "", csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("disconnect: %d", code)
	}
}

// A shop trckable has never heard of reports a sale, and it shows up as money
// like any other — as long as it is signed with the secret trckable handed out.
func TestCustomProviderEndToEnd(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site

	code, conn := do(t, c, "POST", base+"/payments", `{"provider":"custom"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("connect: %d %v", code, conn)
	}
	// There is no provider to hand out a secret, so trckable makes one.
	if conn["has_secret"] != true {
		t.Fatalf("no signing secret was generated: %v", conn)
	}
	_, sec := do(t, c, "GET", base+"/payments/"+conn["id"].(string)+"/secret", "")
	secret, _ := sec["secret"].(string)
	if len(secret) < 20 {
		t.Fatalf("secret: %v", sec)
	}

	g.event(t, event.Event{Kind: event.KindPageview, EventID: 9, TS: g.now.Add(-time.Hour).UnixMilli(), Visitor: 0x77, Path: "/pricing", Channel: "Direct", Country: "DE"})
	g.waitApplied(t, 1)

	send := func(body, sig string, ts int64) int {
		req, _ := http.NewRequest("POST", g.srv.URL+"/webhooks/custom/"+conn["id"].(string), strings.NewReader(body))
		req.Header.Set("Trckable-Timestamp", strconv.FormatInt(ts, 10))
		req.Header.Set("Trckable-Signature", sig)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		return res.StatusCode
	}
	sign := func(body string, ts int64) string {
		m := hmac.New(sha256.New, []byte(secret))
		fmt.Fprintf(m, "%d.%s", ts, body)
		return "v1=" + hex.EncodeToString(m.Sum(nil))
	}

	body := fmt.Sprintf(`{"id":"evt_shop_1","type":"payment","at":%d,"payment":{"id":"ord_1","amount":12000,"tax":2000,"currency":"usd","visitor":"%s"}}`,
		g.now.Unix(), strconv.FormatUint(0x77, 36))
	ts := time.Now().Unix()
	if got := send(body, sign(body, ts), ts); got != http.StatusOK {
		t.Fatalf("signed webhook: %d", got)
	}
	if got := send(body, "v1=deadbeef", ts); got != http.StatusBadRequest {
		t.Fatalf("a forged signature was accepted: %d", got)
	}
	// The same sale sent twice is still one sale.
	if got := send(body, sign(body, ts), ts); got != http.StatusOK {
		t.Fatalf("resend: %d", got)
	}

	g.rev.Process(context.Background())
	_, out := do(t, c, "GET", base+"/report?from=2026-09-22&to=2026-09-22", "")
	money, _ := out["current"].(map[string]any)["money"].(map[string]any)
	if money == nil || money["revenue"] != 10000.0 { // 120.00 paid, 20.00 tax
		t.Fatalf("the sale never reached the report: %v", money)
	}
	if money["payments"] != 1.0 {
		t.Fatalf("the same sale was counted twice: %v", money)
	}
	if money["paying_visitors"] != 1.0 {
		t.Fatalf("the sale was not attributed to the visit that led to it: %v", money)
	}
}

// Core Web Vitals arrive with the engagement event the tracker already sends,
// and are reported at the 75th percentile — the experience three quarters of
// visits were at least as good as.
func TestWebVitalsEndToEnd(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site

	// Ten views of /slow and ten of /fast, each with its own LCP. The p75 of
	// 1000..1900 is 1675; of 3000..3900 it is 3675.
	var id uint64
	ev := func(e event.Event) {
		id++
		e.EventID = id
		g.event(t, e)
	}
	for i := range 10 {
		for _, page := range []struct {
			path string
			lcp  uint32
		}{{"/fast", 1000}, {"/slow", 3000}} {
			pvid := uint64(1000 + id)
			ev(event.Event{Kind: event.KindPageview, TS: g.now.Add(-time.Hour).UnixMilli(), Visitor: uint64(i + 1), Pageview: pvid, Path: page.path})
			ev(event.Event{Kind: event.KindEngagement, TS: g.now.Add(-time.Hour).UnixMilli(), Visitor: uint64(i + 1), Pageview: pvid,
				EngagedMs: 5000, LCPms: page.lcp + uint32(i)*100, CLS1k: 40 + uint32(i), INPms: 120 + uint32(i)*10})
		}
	}
	g.waitApplied(t, id)

	// The module is off by default for a site that never asked for it.
	if code, _ := do(t, c, "GET", base+"/report/vitals?from=2026-09-22&to=2026-09-22", ""); code != http.StatusNotFound {
		t.Fatalf("vitals answered with the module off: %d", code)
	}
	if code, _ := do(t, c, "PUT", base+"/modules/vitals", `{"enabled":true}`, csrf, "1"); code != 200 {
		t.Fatal("could not turn the module on")
	}

	code, out := do(t, c, "GET", base+"/report/vitals?from=2026-09-22&to=2026-09-22", "")
	if code != 200 {
		t.Fatalf("vitals: %d %v", code, out)
	}
	if out["samples"] != 20.0 {
		t.Fatalf("samples: %v", out["samples"])
	}
	// The p75 spans both pages: 1000..1900 and 3000..3900 together.
	if out["lcp_ms"].(float64) < 3000 || out["lcp_ms"].(float64) > 3700 {
		t.Errorf("p75 LCP = %v, want it inside the slow page's range", out["lcp_ms"])
	}
	// CLS 0.040–0.049 and INP 120–210 are both inside Google's "good".
	if out["cls_1k"].(float64) > 100 || out["inp_ms"].(float64) > 200 {
		t.Errorf("scores: %v", out)
	}
	if out["good"] != 2.0 {
		t.Errorf("good scores = %v, want 2 of 3 (LCP is over 2.5 s)", out["good"])
	}
	pages, _ := out["pages"].([]any)
	if len(pages) != 2 || pages[0].(map[string]any)["value"] != "/slow" {
		t.Fatalf("the slowest page should be first: %v", pages)
	}
	if v := pages[0].(map[string]any)["visitors"].(float64); v < 3000 {
		t.Errorf("/slow's own p75 = %v", v)
	}
}

// Retention: of the people who first came in a week, how many came back. A
// visitor's cohort is when they were first seen, not when this report starts.
func TestRetentionCohorts(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site

	// Three weeks, Mondays: Sep 1, Sep 8, Sep 15 2026.
	mon := func(day, hour int) int64 {
		return time.Date(2026, 9, day, hour, 0, 0, 0, time.UTC).UnixMilli()
	}
	var id uint64
	visit := func(v uint64, firstSeen, at int64) {
		id++
		g.event(t, event.Event{Kind: event.KindPageview, EventID: id, TS: at, Visitor: v, Pageview: id, Path: "/", FirstSeen: firstSeen})
	}
	// Week 1 cohort: three people. Two come back in week 2, one in week 3.
	for _, v := range []uint64{1, 2, 3} {
		visit(v, mon(1, 9), mon(1, 9))
	}
	visit(1, mon(1, 9), mon(8, 9))
	visit(2, mon(1, 9), mon(8, 9))
	visit(1, mon(1, 9), mon(15, 9))
	// Week 2 cohort: two people, neither returns.
	visit(4, mon(8, 10), mon(8, 10))
	visit(5, mon(8, 10), mon(8, 10))
	g.waitApplied(t, id)

	code, out := do(t, c, "GET", base+"/report/retention?from=2026-09-01&to=2026-09-21&tz=UTC", "")
	if code != 200 {
		t.Fatalf("retention: %d %v", code, out)
	}
	weeks := out["weeks"].([]any)
	if len(weeks) != 2 || weeks[0] != "2026-08-31" {
		t.Fatalf("cohorts: %v", weeks)
	}
	size := out["size"].([]any)
	if size[0] != 3.0 || size[1] != 2.0 {
		t.Fatalf("cohort sizes: %v", size)
	}
	back := out["back"].([]any)
	first := back[0].([]any)
	if len(first) != 3 || first[0] != 3.0 || first[1] != 2.0 || first[2] != 1.0 {
		t.Fatalf("week 1 retention: %v", first)
	}
	// The second cohort is only two weeks old, so its row stops there rather
	// than showing a zero for a week that has not happened.
	second := back[1].([]any)
	if len(second) != 2 || second[0] != 2.0 || second[1] != 0.0 {
		t.Fatalf("week 2 retention: %v", second)
	}
}

// An export is the page you were looking at, as a file: the same range, the
// same filters, and a shape a spreadsheet can pivot without being rearranged.
func TestExportCSV(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	day := func(d, h int) int64 { return time.Date(2026, 9, d, h, 0, 0, 0, time.UTC).UnixMilli() }
	n := uint64(0)
	add := func(e event.Event) { n++; e.EventID = n; g.event(t, e) }
	add(event.Event{Kind: event.KindPageview, TS: day(20, 9), Visitor: 1, Path: "/", Channel: "Search", Country: "DE"})
	add(event.Event{Kind: event.KindPageview, TS: day(20, 10), Visitor: 2, Path: "/pricing", Channel: "AI", Country: "US"})
	add(event.Event{Kind: event.KindPageview, TS: day(19, 9), Visitor: 3, Path: "/", Channel: "Search", Country: "DE"})
	g.waitApplied(t, n)

	get := func(qs string) (*http.Response, [][]string) {
		t.Helper()
		req, _ := http.NewRequest("GET", g.srv.URL+"/api/v1/sites/"+g.site+"/export.csv"+qs, nil)
		resp, err := c.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			return resp, nil // an error is JSON, not a spreadsheet
		}
		rows, err := csv.NewReader(resp.Body).ReadAll()
		if err != nil {
			t.Fatalf("not valid CSV: %v", err)
		}
		return resp, rows
	}

	resp, rows := get("?from=2026-09-14&to=2026-09-20")
	if resp.StatusCode != 200 {
		t.Fatalf("export: %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/csv") {
		t.Errorf("content type = %q", ct)
	}
	if cd := resp.Header.Get("Content-Disposition"); !strings.Contains(cd, "2026-09-14-to-2026-09-20.csv") {
		t.Errorf("filename = %q", cd)
	}
	if got := rows[0]; got[0] != "dimension" || got[1] != "value" || got[2] != "visitors" {
		t.Fatalf("header = %v", got)
	}

	by := map[string]map[string]string{}
	for _, r := range rows[1:] {
		if by[r[0]] == nil {
			by[r[0]] = map[string]string{}
		}
		by[r[0]][r[1]] = r[2]
	}
	if v := by["total"]; len(v) != 1 {
		t.Fatalf("expected one total row, got %v", v)
	}
	for _, r := range rows[1:] {
		if r[0] == "total" && r[2] != "3" {
			t.Errorf("total visitors = %s, want 3", r[2])
		}
	}
	if by["channel"]["Search"] != "2" || by["channel"]["AI"] != "1" {
		t.Errorf("channels = %v", by["channel"])
	}
	if by["country"]["DE"] != "2" {
		t.Errorf("countries = %v", by["country"])
	}
	// Every bucket in the range is a row, including the empty ones, so a
	// spreadsheet can redraw the chart without filling gaps itself.
	if len(by["day"]) != 7 {
		t.Errorf("day rows = %d, want 7: %v", len(by["day"]), by["day"])
	}

	// A filter is part of the question, so it has to be part of the answer.
	_, rows = get("?from=2026-09-14&to=2026-09-20&f=channel:Search")
	for _, r := range rows[1:] {
		if r[0] == "total" && r[2] != "2" {
			t.Errorf("filtered total = %s, want 2", r[2])
		}
		if r[0] == "channel" && r[1] == "AI" {
			t.Error("a filtered export still contained the filtered-out channel")
		}
	}

	// And a bad question is still a bad question.
	if resp, _ := get("?f=password:x"); resp.StatusCode != http.StatusBadRequest {
		t.Errorf("bad filter: %d", resp.StatusCode)
	}
}

// Somebody first seen months before the range who comes back inside it is a
// returning visitor, not a cohort of their own. Counting them against a week
// the report never read produced "102 of 0 came back" — 10,200%.
func TestRetentionIgnoresCohortsBeforeTheRange(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	at := func(month time.Month, day int) int64 {
		return time.Date(2026, month, day, 9, 0, 0, 0, time.UTC).UnixMilli()
	}
	var id uint64
	visit := func(v uint64, firstSeen, ts int64) {
		id++
		g.event(t, event.Event{Kind: event.KindPageview, EventID: id, TS: ts, Visitor: v, Pageview: id, Path: "/", FirstSeen: firstSeen})
	}
	// First seen in June, back in September: old friends, not newcomers.
	for v := uint64(1); v <= 5; v++ {
		visit(v, at(6, 1), at(9, 8))
	}
	// One real newcomer in the range.
	visit(9, at(9, 8), at(9, 8))
	g.waitApplied(t, id)

	code, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/report/retention?from=2026-09-07&to=2026-09-27&tz=UTC", "")
	if code != 200 {
		t.Fatalf("retention: %d %v", code, out)
	}
	weeks, _ := out["weeks"].([]any)
	sizes, _ := out["size"].([]any)
	if len(weeks) != 1 || weeks[0] != "2026-09-07" || sizes[0] != 1.0 {
		t.Fatalf("want one cohort of one (the newcomer), got weeks=%v sizes=%v", weeks, sizes)
	}
	for i, row := range out["back"].([]any) {
		size := sizes[i].(float64)
		for k, n := range row.([]any) {
			if n.(float64) > size {
				t.Errorf("cohort %v week %d: %v came back of %v", weeks[i], k, n, size)
			}
		}
	}
}

func TestOverviewListsEverySite(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	if code, out := do(t, c, "POST", g.srv.URL+"/api/v1/sites", `{"domain":"second.com"}`, csrf, "1"); code != http.StatusCreated {
		t.Fatalf("second site: %d %v", code, out)
	}
	at := g.now.Add(-2 * time.Hour).UnixMilli()
	g.event(t, event.Event{EventID: 1, Kind: event.KindPageview, TS: at, Visitor: 1, Path: "/", Channel: "Direct"})
	g.event(t, event.Event{EventID: 2, Kind: event.KindPageview, TS: at + 60_000, Visitor: 1, Path: "/pricing", Channel: "Direct"})
	g.event(t, event.Event{EventID: 3, Kind: event.KindPageview, TS: at, Visitor: 2, Path: "/", Channel: "Search"})
	g.waitApplied(t, 3)

	code, out := do(t, c, "GET", g.srv.URL+"/api/v1/overview?days=7", "")
	if code != 200 {
		t.Fatalf("overview: %d %v", code, out)
	}
	sites := out["sites"].([]any)
	if len(sites) != 2 {
		t.Fatalf("sites = %v", sites)
	}
	byDomain := map[string]map[string]any{}
	for _, s := range sites {
		m := s.(map[string]any)
		byDomain[m["domain"].(string)] = m
	}
	one, two := byDomain["site.com"], byDomain["second.com"]
	if one["visitors"] != float64(2) || one["pageviews"] != float64(3) || len(one["series"].([]any)) != 7 {
		t.Fatalf("site.com = %v", one)
	}
	if two["visitors"] != float64(0) || len(two["series"].([]any)) != 7 {
		t.Fatalf("second.com = %v", two)
	}
}

// An operator's one-time link signs the owner in once, within a minute, and
// never for someone who turned on a second step.
func TestSigninLinks(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	if code, _ := do(t, client(), "POST", g.srv.URL+"/_trckable/signin", `{"email":"me@site.com"}`); code != http.StatusNotFound {
		t.Fatalf("without an operator token the endpoint must not exist: %d", code)
	}
	g.api.Operator = "tkb_op_test_0123456789"
	op := []string{"Authorization", "Bearer tkb_op_test_0123456789"}
	if code, _ := do(t, client(), "POST", g.srv.URL+"/_trckable/signin", `{"email":"me@site.com"}`, "Authorization", "Bearer nope"); code != http.StatusUnauthorized {
		t.Fatalf("wrong operator token: %d", code)
	}
	if code, _ := do(t, client(), "POST", g.srv.URL+"/_trckable/signin", `{"email":"nobody@site.com"}`, op...); code != http.StatusNotFound {
		t.Fatalf("unknown email: %d", code)
	}
	code, out := do(t, client(), "POST", g.srv.URL+"/_trckable/signin", `{"email":"ME@site.com"}`, op...)
	if code != http.StatusOK {
		t.Fatalf("link: %d %v", code, out)
	}
	link := g.srv.URL + out["url"].(string)

	browser := client()
	if code, _ := do(t, browser, "GET", g.srv.URL+"/api/v1/me", ""); code != http.StatusUnauthorized {
		t.Fatalf("signed in before using the link: %d", code)
	}
	res, err := browser.Get(link)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if code, me := do(t, browser, "GET", g.srv.URL+"/api/v1/me", ""); code != http.StatusOK || me["email"] != "me@site.com" {
		t.Fatalf("the link did not sign in: %d %v", code, me)
	}
	// Spent: a second browser gets the sign-in page, not a session.
	other := client()
	other.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	res, err = other.Get(link)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if loc := res.Header.Get("Location"); loc != "/login" {
		t.Fatalf("a used link went to %q", loc)
	}
	// A second step on: no links.
	if _, err := g.ctl.DB.Exec(`UPDATE users SET totp_enabled = 1`); err != nil {
		t.Fatal(err)
	}
	if code, _ := do(t, client(), "POST", g.srv.URL+"/_trckable/signin", `{"email":"me@site.com"}`, op...); code != http.StatusConflict {
		t.Fatalf("two-step on: %d", code)
	}
}
