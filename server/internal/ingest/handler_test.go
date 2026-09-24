package ingest

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/wal"
)

const chromeUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"

type fakeSites map[string]Site

func (f fakeSites) Site(id string) (Site, bool) { s, ok := f[id]; return s, ok }

func newHandler(t *testing.T) (*Handler, *wal.Log) {
	t.Helper()
	l, err := wal.Open(t.TempDir(), wal.Options{NoSync: true})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { l.Close() })
	return &Handler{
		Log:      l,
		Sites:    fakeSites{"tkb_test": {ID: "tkb_test", Domain: "site.com", ProxyKey: "tkb_px_secret"}},
		Salts:    NewSalts(nil),
		ClientIP: RemoteIP,
		Now:      func() time.Time { return time.Date(2026, 9, 22, 12, 0, 0, 0, time.UTC) },
	}, l
}

func post(h http.Handler, body, ua string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/e", strings.NewReader(body))
	req.Header.Set("User-Agent", ua)
	req.RemoteAddr = "203.0.113.77:5555"
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

// lastEvent reads the newest WAL record back as an Event.
func lastEvent(t *testing.T, l *wal.Log) (event.Event, string) {
	t.Helper()
	committed, _ := l.Committed()
	rd, err := l.NewReader(committed)
	if err != nil {
		t.Fatal(err)
	}
	defer rd.Close()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	recs, err := rd.Next(ctx, 1)
	if err != nil {
		t.Fatal(err)
	}
	var e event.Event
	if err := event.Unmarshal(recs[0].Payload, &e); err != nil {
		t.Fatal(err)
	}
	return e, string(recs[0].Payload)
}

func TestPageviewIsEnrichedAndPrivate(t *testing.T) {
	h, l := newHandler(t)
	w := post(h, `{"s":"tkb_test","k":"pv","u":"https://www.site.com/pricing?email=me@x.com&utm_source=hn&gclid=1",
		"r":"https://news.ycombinator.com/item?id=1","w":390,"l":"de-DE","id":"abc","v":"k3j2.m1a2b3"}`, chromeUA)
	if w.Code != http.StatusAccepted {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	e, raw := lastEvent(t, l)
	if e.Path != "/pricing" || e.Hostname != "site.com" || e.UTMSource != "hn" {
		t.Fatalf("url parsing: %+v", e)
	}
	if e.Channel != ChannelPaid || e.RefHost != "news.ycombinator.com" {
		t.Fatalf("channel/ref: %s %s", e.Channel, e.RefHost)
	}
	if e.Browser != "Chrome" || e.Device != "Mobile" || e.Language != "de" {
		t.Fatalf("ua/lang: %+v", e)
	}
	if strings.Contains(raw, "203.0.113.77") || strings.Contains(raw, "me@x.com") {
		t.Fatalf("private data reached the WAL: %s", raw)
	}
	if e.EventID != 13368 { // "abc" in base36
		t.Fatalf("event id %d", e.EventID)
	}
}

func TestBotsAreDroppedSilently(t *testing.T) {
	h, l := newHandler(t)
	before, _ := l.Committed()
	for _, ua := range []string{
		"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
		"curl/8.4.0",
		"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2)",
		"",
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36",
	} {
		w := post(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/"}`, ua)
		if w.Code != http.StatusAccepted {
			t.Fatalf("bot %q got %d", ua, w.Code)
		}
	}
	after, _ := l.Committed()
	if after != before {
		t.Fatalf("bots reached the WAL: %d → %d", before, after)
	}
	if h.Stats.Bots.Load() != 5 {
		t.Fatalf("bot counter %d", h.Stats.Bots.Load())
	}
}

func TestRejections(t *testing.T) {
	h, _ := newHandler(t)
	cases := map[string]string{
		"unknown site":     `{"s":"tkb_nope","k":"pv","u":"https://site.com/"}`,
		"foreign hostname": `{"s":"tkb_test","k":"pv","u":"https://evil.com/"}`,
		"localhost":        `{"s":"tkb_test","k":"pv","u":"http://localhost:3000/"}`,
		"bad kind":         `{"s":"tkb_test","k":"zz","u":"https://site.com/"}`,
		"bad goal name":    `{"s":"tkb_test","k":"g","n":"DROP TABLE","u":"https://site.com/"}`,
		"not json":         `hello`,
		"missing url":      `{"s":"tkb_test","k":"pv"}`,
	}
	for name, body := range cases {
		if w := post(h, body, chromeUA); w.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d, want 400", name, w.Code)
		}
	}
	big := `{"s":"tkb_test","k":"pv","u":"https://site.com/","r":"` + strings.Repeat("x", 9000) + `"}`
	if w := post(h, big, chromeUA); w.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("oversized: status %d", w.Code)
	}
}

func TestSubdomainAllowedAndGoalProps(t *testing.T) {
	h, l := newHandler(t)
	w := post(h, `{"s":"tkb_test","k":"g","n":"signup","u":"https://app.site.com/join",
		"p":{"plan":"pro","Bad Key!":"x","trial-days":"14"}}`, chromeUA)
	if w.Code != http.StatusAccepted {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	e, _ := lastEvent(t, l)
	if e.Kind != event.KindGoal || e.Goal != "signup" || e.Props["plan"] != "pro" || e.Props["trial_days"] != "14" {
		t.Fatalf("goal: %+v", e)
	}
	if _, ok := e.Props["Bad Key!"]; ok {
		t.Fatal("invalid prop key kept")
	}
}

func TestCookielessVisitorIsStableWithinADay(t *testing.T) {
	h, l := newHandler(t)
	body := `{"s":"tkb_test","k":"pv","u":"https://site.com/"}`
	post(h, body, chromeUA)
	a, _ := lastEvent(t, l)
	post(h, body, chromeUA)
	b, _ := lastEvent(t, l)
	if a.Visitor == 0 || a.Visitor != b.Visitor {
		t.Fatalf("cookieless ids differ within a day: %d %d", a.Visitor, b.Visitor)
	}
	h.Now = func() time.Time { return time.Date(2026, 9, 23, 12, 0, 0, 0, time.UTC) }
	post(h, body, chromeUA)
	c, _ := lastEvent(t, l)
	if c.Visitor == a.Visitor {
		t.Fatal("cookieless id must change the next day (salt rotation)")
	}
}

func TestQueuedEventKeepsItsTime(t *testing.T) {
	h, l := newHandler(t)
	post(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/","a":600000}`, chromeUA) // queued 10 min
	e, _ := lastEvent(t, l)
	want := h.Now().Add(-10 * time.Minute).UnixMilli()
	if e.TS != want {
		t.Fatalf("ts %d, want %d", e.TS, want)
	}
	post(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/","a":99999999}`, chromeUA) // absurd age is clamped
	e, _ = lastEvent(t, l)
	if h.Now().UnixMilli()-e.TS != maxAgeMs {
		t.Fatalf("age not clamped: %d", h.Now().UnixMilli()-e.TS)
	}
}

// geoSpy records which IP was used for the location lookup.
func geoSpy(h *Handler) *string {
	var used string
	h.Geo = func(ip string) (string, string, string) {
		used = ip
		if ip == "79.106.125.62" {
			return "AL", "Tirana", "Tirana"
		}
		return "US", "", ""
	}
	return &used
}

func proxied(h http.Handler, body, key string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/e", strings.NewReader(body))
	req.Header.Set("User-Agent", chromeUA)
	req.Header.Set("X-Trckable-Proxy-Key", key)
	req.Header.Set("X-Trckable-Client-IP", "79.106.125.62") // what the proxy saw
	req.RemoteAddr = "10.0.0.5:4444"                        // the proxy itself
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func TestProxyWithKeyIsTrustedAndSetsTheCookie(t *testing.T) {
	h, l := newHandler(t)
	used := geoSpy(h)
	w := proxied(h, `{"s":"tkb_test","k":"pv","u":"https://www.site.com/"}`, "tkb_px_secret")
	if w.Code != http.StatusAccepted {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	if *used != "79.106.125.62" {
		t.Fatalf("geo used %q, want the forwarded visitor IP", *used)
	}
	e, _ := lastEvent(t, l)
	if e.Country != "AL" || e.City != "Tirana" {
		t.Fatalf("geo: %+v", e)
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("want 1 cookie, got %d", len(cookies))
	}
	c := cookies[0]
	if c.Name != "trckable_vid" || c.Domain != "site.com" || !c.Secure || c.HttpOnly || c.MaxAge != 400*24*3600 {
		t.Fatalf("cookie attributes: %+v", c)
	}
	if id, _, ok := parseVisitor(c.Value); !ok || id != e.Visitor {
		t.Fatalf("cookie %q does not match stored visitor %d", c.Value, e.Visitor)
	}
}

func TestProxyWithWrongKeyIsNotTrusted(t *testing.T) {
	h, _ := newHandler(t)
	used := geoSpy(h)
	w := proxied(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/"}`, "tkb_px_guess")
	if w.Code != http.StatusAccepted {
		t.Fatalf("status %d", w.Code)
	}
	if *used != "10.0.0.5" {
		t.Fatalf("forged client IP header was trusted: geo used %q", *used)
	}
	if len(w.Result().Cookies()) != 0 {
		t.Fatal("cookie set without a valid proxy key")
	}
}

func TestProxyNeverSetsACookieForCookielessVisitors(t *testing.T) {
	h, _ := newHandler(t)
	w := proxied(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/","c":1}`, "tkb_px_secret")
	if w.Code != http.StatusAccepted || len(w.Result().Cookies()) != 0 {
		t.Fatalf("status %d, cookies %v", w.Code, w.Result().Cookies())
	}
}

func TestLocalhostOnlyInDevMode(t *testing.T) {
	h, _ := newHandler(t)
	if w := post(h, `{"s":"tkb_test","k":"pv","u":"http://localhost:5173/"}`, chromeUA); w.Code != http.StatusBadRequest {
		t.Fatalf("localhost without dev: %d", w.Code)
	}
	if w := post(h, `{"s":"tkb_test","k":"pv","u":"http://localhost:5173/","dev":1}`, chromeUA); w.Code != http.StatusAccepted {
		t.Fatalf("localhost with dev: %d %s", w.Code, w.Body)
	}
}

func TestRateLimitAnswers429(t *testing.T) {
	h, _ := newHandler(t)
	codes := map[int]int{}
	for i := 0; i < 100; i++ { // burst is 60 per (IP, visitor)
		codes[post(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/","v":"k3j2.m1a2b3"}`, chromeUA).Code]++
	}
	if codes[http.StatusTooManyRequests] == 0 || codes[http.StatusAccepted] < 55 {
		t.Fatalf("codes %v", codes)
	}
	// A different visitor behind the same IP (office NAT) is not throttled.
	if w := post(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/","v":"zz99.m1a2b3"}`, chromeUA); w.Code != http.StatusAccepted {
		t.Fatalf("other visitor throttled: %d", w.Code)
	}
}

// A script that invents a new visitor id for every request is still one
// address: the per-address ceiling stops it, far above what a busy office
// sends.
func TestRateLimitCatchesRotatingVisitorIDs(t *testing.T) {
	h, _ := newHandler(t)
	codes := map[int]int{}
	for i := 0; i < perIPBurst+500; i++ {
		body := fmt.Sprintf(`{"s":"tkb_test","k":"pv","u":"https://site.com/","v":"v%d.m1a2b3"}`, i)
		codes[post(h, body, chromeUA).Code]++
	}
	if codes[http.StatusTooManyRequests] == 0 || codes[http.StatusAccepted] < perIPBurst {
		t.Fatalf("codes %v", codes)
	}
}

func TestDevModeAcceptsAutomationOnlyOnLocalhost(t *testing.T) {
	h, l := newHandler(t)
	headless := "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0 Safari/537.36"
	before, _ := l.Committed()
	post(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/","dev":1}`, headless) // real host: still a bot
	if after, _ := l.Committed(); after != before {
		t.Fatal("dev flag let a headless browser through on a real hostname")
	}
	if w := post(h, `{"s":"tkb_test","k":"pv","u":"http://127.0.0.1:5173/","dev":1}`, headless); w.Code != http.StatusAccepted {
		t.Fatalf("localhost dev: %d", w.Code)
	}
	if after, _ := l.Committed(); after != before+1 {
		t.Fatal("headless browser on localhost in dev mode was not recorded")
	}
}

const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"

func TestReferrerSpamIsDropped(t *testing.T) {
	h, l := newHandler(t)
	before, _ := l.Committed()
	for _, ref := range []string{"https://0-0.fr/", "http://www.0-0.fr/x", "https://sub.0-0.fr/"} {
		if w := post(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/","r":"`+ref+`"}`, chrome); w.Code != http.StatusAccepted {
			t.Fatalf("%s: %d", ref, w.Code)
		}
	}
	if after, _ := l.Committed(); after != before {
		t.Fatalf("referrer spam reached the WAL: %d → %d", before, after)
	}
	if h.Stats.Bots.Load() != 3 {
		t.Fatalf("spam counted as bots: %d", h.Stats.Bots.Load())
	}
	post(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/","r":"https://news.ycombinator.com/"}`, chrome)
	if ev, _ := lastEvent(t, l); ev.RefHost != "news.ycombinator.com" {
		t.Fatalf("a real referrer was dropped: %+v", ev)
	}
	if isSpam("fr") || isSpam("") || isSpam("google.com") {
		t.Fatal("isSpam matched something that is not on the list")
	}
}

func TestStricterFilteringDropsDataCentres(t *testing.T) {
	h, l := newHandler(t)
	asked := 0
	h.Hosting = func(ip string) bool { asked++; return ip == "203.0.113.77" }

	// A site with the default filtering is not asked about at all.
	post(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/"}`, chrome)
	if asked != 0 {
		t.Fatal("the network was checked for a site without stricter filtering")
	}
	if ev, _ := lastEvent(t, l); ev.Path != "/" {
		t.Fatalf("a normal visit was dropped: %+v", ev)
	}

	h.Sites = fakeSites{"tkb_test": {ID: "tkb_test", Domain: "site.com", BotStrict: true}}
	before, _ := l.Committed()
	if w := post(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/strict"}`, chrome); w.Code != http.StatusAccepted {
		t.Fatalf("got %d", w.Code)
	}
	if after, _ := l.Committed(); after != before || asked != 1 {
		t.Fatalf("a data-centre visit was kept (asked %d)", asked)
	}
}

// A browser on one site cannot post events as another: the Origin it sends
// must be the page it claims. www. and letter case do not matter; server-side
// senders (no Origin) and sandboxed frames ("null") are not refused.
func TestOriginMustMatchThePage(t *testing.T) {
	h, l := newHandler(t)
	body := `{"s":"tkb_test","k":"pv","u":"https://site.com/","v":"k3j2.m1a2b3"}`
	for origin, want := range map[string]bool{
		"":                      true,
		"null":                  true,
		"https://site.com":      true,
		"https://www.SITE.com":  true,
		"https://evil.example":  false,
		"https://site.com.evil": false,
	} {
		before, _ := l.Committed()
		req := httptest.NewRequest(http.MethodPost, "/api/e", strings.NewReader(body))
		req.Header.Set("User-Agent", chromeUA)
		req.RemoteAddr = "203.0.113.9:1234"
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		after, _ := l.Committed()
		if got := after > before; got != want {
			t.Errorf("Origin %q: stored=%v, want %v (code %d)", origin, got, want, w.Code)
		}
	}
}
