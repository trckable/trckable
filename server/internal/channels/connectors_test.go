package channels_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/channels"
	"github.com/trckable/trckable/server/internal/secrets"
)

// platform is a stand-in for one platform's servers: answers by path, and a
// record of every request.
type platform struct {
	srv  *httptest.Server
	mu   sync.Mutex
	hits []*http.Request
	// status/body to answer the next calls on a path with, before the normal
	// answer: used to throttle.
	fail map[string][]fakeAnswer
}

type fakeAnswer struct {
	Status int
	Body   string
	Header map[string]string
}

func newPlatform(t *testing.T, routes map[string]string) *platform {
	t.Helper()
	p := &platform{fail: map[string][]fakeAnswer{}}
	p.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p.mu.Lock()
		_ = r.ParseForm()
		p.hits = append(p.hits, r)
		var f *fakeAnswer
		if q := p.fail[r.URL.Path]; len(q) > 0 {
			f, p.fail[r.URL.Path] = &q[0], q[1:]
		}
		p.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if f != nil {
			for k, v := range f.Header {
				w.Header().Set(k, v)
			}
			w.WriteHeader(f.Status)
			fmt.Fprint(w, f.Body)
			return
		}
		body, ok := routes[r.URL.Path]
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		fmt.Fprint(w, body)
	}))
	t.Cleanup(p.srv.Close)
	return p
}

func (p *platform) count(path string) int {
	p.mu.Lock()
	defer p.mu.Unlock()
	n := 0
	for _, r := range p.hits {
		if r.URL.Path == path {
			n++
		}
	}
	return n
}

func (p *platform) last(path string) *http.Request {
	p.mu.Lock()
	defer p.mu.Unlock()
	for i := len(p.hits) - 1; i >= 0; i-- {
		if p.hits[i].URL.Path == path {
			return p.hits[i]
		}
	}
	return nil
}

// quick makes retries instant and records the waits.
func quick() (func(context.Context, time.Duration) error, *[]time.Duration) {
	var waits []time.Duration
	return func(_ context.Context, d time.Duration) error {
		if d > 0 && d != time.Nanosecond {
			waits = append(waits, d)
		}
		return nil
	}, &waits
}

func youtube(t *testing.T, p *platform) *channels.YouTubeConnector {
	t.Helper()
	sleep, _ := quick()
	return &channels.YouTubeConnector{
		Doer: channels.Doer{Sleep: sleep}, ID: "yt-client-id", Secret: secrets.NewSecret("yt-client-secret-FAKE"),
		AuthURL: p.srv.URL + "/auth", TokenURL: p.srv.URL + "/token", RevokeURL: p.srv.URL + "/revoke", APIURL: p.srv.URL + "/youtube/v3", StatsURL: p.srv.URL + "/v2",
	}
}

func TestYouTubeSignsInAndReadsViewsPerDay(t *testing.T) {
	p := newPlatform(t, map[string]string{
		"/token":               `{"access_token":"ya29.YT-ACCESS-FAKE","refresh_token":"1//YT-REFRESH-FAKE","expires_in":3599,"token_type":"Bearer"}`,
		"/youtube/v3/channels": ytChannels,
		"/v2/reports":          ytReport,
		"/revoke":              `{}`,
	})
	c := youtube(t, p)
	if !c.Configured() {
		t.Fatal("not configured with keys")
	}
	// The consent page asks for read-only scopes, offline access and PKCE.
	u, _ := url.Parse(c.SignInURL("https://app.example/cb", "state-1", "verifier-verifier-verifier-verifier-1234"))
	q := u.Query()
	for _, s := range strings.Fields(q.Get("scope")) {
		if !strings.HasSuffix(s, ".readonly") {
			t.Errorf("a scope that is not read-only: %s", s)
		}
	}
	if q.Get("access_type") != "offline" || q.Get("code_challenge_method") != "S256" || q.Get("state") != "state-1" {
		t.Errorf("sign-in query: %v", q)
	}

	tok, who, err := c.Exchange(context.Background(), "https://app.example/cb", "code-1", "verifier-verifier-verifier-verifier-1234")
	if err != nil {
		t.Fatal(err)
	}
	if who.ID != "UCmakerchannel0001" || who.Handle != "@makerstudio" {
		t.Errorf("identity %+v", who)
	}
	if tok.Access.Reveal() != "ya29.YT-ACCESS-FAKE" || tok.Refresh.Reveal() != "1//YT-REFRESH-FAKE" || tok.Expires.IsZero() { //nolint:gosec // fake tokens of the test platform
		t.Errorf("token %+v", tok)
	}
	if v := p.last("/token").PostForm.Get("code_verifier"); v == "" {
		t.Error("the code was exchanged without the PKCE verifier")
	}
	if got := p.last("/youtube/v3/channels").Header.Get("Authorization"); got != "Bearer ya29.YT-ACCESS-FAKE" { //nolint:gosec // fake tokens of the test platform
		t.Errorf("the channel was asked with %q", got)
	}

	days, err := c.Daily(context.Background(), tok, who, "2026-09-19", "2026-09-21")
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 3 || days[0].Day != "2026-09-19" || days[0].Views != 120 || days[2].Views != 143 {
		t.Errorf("days %+v", days)
	}
	rq := p.last("/v2/reports").URL.Query()
	if rq.Get("metrics") != "views" || rq.Get("dimensions") != "day" || rq.Get("ids") != "channel==MINE" {
		t.Errorf("report query %v", rq)
	}
	// Nothing in the address: the token travels in the header.
	if strings.Contains(p.last("/v2/reports").URL.RawQuery, "ya29") {
		t.Error("the access token is in the address")
	}

	c.Revoke(context.Background(), tok)
	if p.last("/revoke").PostForm.Get("token") != "1//YT-REFRESH-FAKE" {
		t.Error("revoke did not send the refresh token")
	}
}

func TestYouTubeRefreshesAndReportsARevokedGrant(t *testing.T) {
	p := newPlatform(t, map[string]string{"/token": `{"access_token":"ya29.NEW-ACCESS","expires_in":3600}`})
	c := youtube(t, p)
	old := channels.Token{Access: secrets.NewSecret("old"), Refresh: secrets.NewSecret("r-1")}
	nt, err := c.Refresh(context.Background(), old)
	if err != nil || nt.Access.Reveal() != "ya29.NEW-ACCESS" || nt.Refresh.Reveal() != "r-1" { //nolint:gosec // fake tokens of the test platform
		t.Fatalf("refresh: %+v %v", nt, err)
	}
	p.fail["/token"] = []fakeAnswer{{Status: 400, Body: googleGrant}}
	if _, err := c.Refresh(context.Background(), old); !errors.Is(err, channels.ErrDenied) {
		t.Errorf("a revoked grant: %v", err)
	}
	if _, err := c.Refresh(context.Background(), channels.Token{}); !errors.Is(err, channels.ErrDenied) {
		t.Errorf("no refresh token: %v", err)
	}
}

func TestInstagramSignsInWithALongLivedTokenAndReadsEachDay(t *testing.T) {
	p := newPlatform(t, map[string]string{
		"/oauth/access_token": igShort, "/access_token": igLong, "/refresh_access_token": igLong, "/v21.0/me": igMe, "/v21.0/17841400000000001/insights": igInsights,
	})
	sleep, _ := quick()
	c := channels.NewInstagram("ig-app-id", secrets.NewSecret("ig-app-secret-FAKE"))
	c.Sleep, c.Pace, c.AuthURL, c.TokenURL, c.GraphURL = sleep, -1, p.srv.URL+"/authorize", p.srv.URL+"/oauth/access_token", p.srv.URL+"/v21.0"

	u, _ := url.Parse(c.SignInURL("https://app.example/cb", "st", ""))
	if sc := u.Query().Get("scope"); sc != "instagram_business_basic,instagram_business_manage_insights" {
		t.Errorf("scope %q", sc)
	}
	tok, who, err := c.Exchange(context.Background(), "https://app.example/cb", "code-1", "")
	if err != nil {
		t.Fatal(err)
	}
	if who.ID != "17841400000000001" || who.Handle != "@maker.studio" || who.AppID != "9988776655" {
		t.Errorf("identity %+v", who)
	}
	if tok.Access.Reveal() != "IGAA-LONG-LIVED-FAKE" || time.Until(tok.Expires) < 50*24*time.Hour {
		t.Errorf("token %+v", tok)
	}
	if g := p.last("/access_token").URL.Query().Get("grant_type"); g != "ig_exchange_token" {
		t.Errorf("long-lived trade used %q", g)
	}
	// The data calls carry the token in the header.
	if got := p.last("/v21.0/me").Header.Get("Authorization"); got != "Bearer IGAA-LONG-LIVED-FAKE" {
		t.Errorf("me was asked with %q", got)
	}

	days, err := c.Daily(context.Background(), tok, who, "2026-09-18", "2026-09-21")
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 4 || days[0].Day != "2026-09-18" || days[3].Day != "2026-09-21" || days[1].Views != 321 {
		t.Errorf("days %+v", days)
	}
	if n := p.count("/v21.0/17841400000000001/insights"); n != 4 {
		t.Errorf("%d insight calls for 4 days", n)
	}
	q := p.last("/v21.0/17841400000000001/insights").URL.Query()
	if q.Get("metric") != "views" || q.Get("metric_type") != "total_value" {
		t.Errorf("insights query %v", q)
	}

	nt, err := c.Refresh(context.Background(), tok)
	if err != nil || nt.Access.Reveal() != "IGAA-LONG-LIVED-FAKE" {
		t.Fatalf("refresh: %+v %v", nt, err)
	}
	if g := p.last("/refresh_access_token").URL.Query().Get("grant_type"); g != "ig_refresh_token" {
		t.Errorf("renewal used %q", g)
	}
}

func TestThreadsReadsTheSeriesAndPutsEachValueOnItsOwnDay(t *testing.T) {
	p := newPlatform(t, map[string]string{
		"/oauth/access_token": thShort, "/access_token": thLong, "/v1.0/me": thMe, "/v1.0/24500000000001/threads_insights": thInsights,
	})
	sleep, _ := quick()
	c := channels.NewThreads("th-app-id", secrets.NewSecret("th-app-secret-FAKE"))
	c.Sleep, c.AuthURL, c.TokenURL, c.GraphURL = sleep, p.srv.URL+"/authorize", p.srv.URL+"/oauth/access_token", p.srv.URL+"/v1.0"

	tok, who, err := c.Exchange(context.Background(), "https://app.example/cb", "code-1", "")
	if err != nil {
		t.Fatal(err)
	}
	if who.ID != "24500000000001" || who.Handle != "@maker.studio" {
		t.Errorf("identity %+v", who)
	}
	if g := p.last("/access_token").URL.Query().Get("grant_type"); g != "th_exchange_token" {
		t.Errorf("long-lived trade used %q", g)
	}
	days, err := c.Daily(context.Background(), tok, who, "2026-09-17", "2026-09-19")
	if err != nil {
		t.Fatal(err)
	}
	// A value that ends at 07:00 UTC on the 19th is the 18th's (Meta's day
	// runs in Pacific time); the one ending on the 21st is outside the days
	// asked for.
	if len(days) != 2 || days[0].Day != "2026-09-18" || days[0].Views != 10 || days[1].Day != "2026-09-19" || days[1].Views != 14 {
		t.Errorf("days %+v", days)
	}
}

func TestAThrottledRequestIsTriedAgainThenReported(t *testing.T) {
	p := newPlatform(t, map[string]string{"/v2/reports": ytReport, "/token": `{}`})
	c := youtube(t, p)
	sleep, waits := quick()
	c.Sleep = sleep
	tok := channels.Token{Access: secrets.NewSecret("a")}

	p.fail["/v2/reports"] = []fakeAnswer{{Status: 429, Body: `{}`, Header: map[string]string{"Retry-After": "7"}}, {Status: 403, Body: googleQuota}}
	days, err := c.Daily(context.Background(), tok, channels.Identity{}, "2026-09-19", "2026-09-21")
	if err != nil || len(days) != 3 {
		t.Fatalf("after two throttled answers: %v %v", days, err)
	}
	if len(*waits) != 2 || (*waits)[0] != 7*time.Second || (*waits)[1] != 14*time.Second {
		t.Errorf("waits %v: the platform's Retry-After first, then doubling", *waits)
	}

	// Never serving: a limit error, and the wait is not spent for ever.
	p.fail["/v2/reports"] = []fakeAnswer{{Status: 429, Body: `{}`}, {Status: 429, Body: `{}`}, {Status: 429, Body: `{}`}}
	var lim *channels.LimitError
	if _, err := c.Daily(context.Background(), tok, channels.Identity{}, "2026-09-19", "2026-09-21"); !errors.As(err, &lim) {
		t.Errorf("a platform that keeps throttling: %v", err)
	}
}

func TestMetaRateLimitAndExpiredTokenAreToldApart(t *testing.T) {
	p := newPlatform(t, map[string]string{"/v1.0/9/threads_insights": thInsights})
	c := channels.NewThreads("id", secrets.NewSecret("s"))
	sleep, _ := quick()
	c.Sleep, c.GraphURL = sleep, p.srv.URL+"/v1.0"
	tok := channels.Token{Access: secrets.NewSecret("THAA-TOKEN")}

	p.fail["/v1.0/9/threads_insights"] = []fakeAnswer{{Status: 400, Body: metaThrottled}}
	if days, err := c.Daily(context.Background(), tok, channels.Identity{ID: "9"}, "2026-09-19", "2026-09-21"); err != nil || len(days) == 0 {
		t.Errorf("code 4 is a throttle and is retried: %v %v", days, err)
	}
	p.fail["/v1.0/9/threads_insights"] = []fakeAnswer{{Status: 400, Body: metaExpired}}
	if _, err := c.Daily(context.Background(), tok, channels.Identity{ID: "9"}, "2026-09-19", "2026-09-21"); !errors.Is(err, channels.ErrDenied) {
		t.Errorf("code 190 means sign in again: %v", err)
	}
	p.fail["/v1.0/9/threads_insights"] = []fakeAnswer{{Status: 401, Body: `{}`}}
	if _, err := c.Daily(context.Background(), tok, channels.Identity{ID: "9"}, "2026-09-19", "2026-09-21"); !errors.Is(err, channels.ErrDenied) {
		t.Errorf("401: %v", err)
	}
	p.fail["/v1.0/9/threads_insights"] = []fakeAnswer{{Status: 404, Body: `{"error":{"message":"private text","code":100}}`}}
	_, err := c.Daily(context.Background(), tok, channels.Identity{ID: "9"}, "2026-09-19", "2026-09-21")
	var api *channels.APIError
	if !errors.As(err, &api) || api.Status != 404 || strings.Contains(err.Error(), "private text") {
		t.Errorf("another refusal carries the status and not the platform's words: %v", err)
	}
}

// Meta's renewal calls put the token in the address, and Go's own errors quote
// the address: nothing returned may.
func TestAnErrorNeverCarriesTheTokenOrTheCode(t *testing.T) {
	c := channels.NewThreads("id", secrets.NewSecret("the-app-secret-FAKE"))
	c.GraphURL = "http://127.0.0.1:1/v1.0" // nothing listens
	c.TokenURL = "http://127.0.0.1:1/oauth/access_token"
	_, err := c.Refresh(context.Background(), channels.Token{Access: secrets.NewSecret("THAA-SECRET-TOKEN")})
	if err == nil {
		t.Fatal("expected an error")
	}
	if strings.Contains(err.Error(), "THAA-SECRET-TOKEN") || strings.Contains(err.Error(), "127.0.0.1") {
		t.Errorf("the error quotes the request: %v", err)
	}
	_, _, err = c.Exchange(context.Background(), "https://app.example/cb", "the-one-time-code", "")
	if err == nil || strings.Contains(err.Error(), "the-one-time-code") || strings.Contains(err.Error(), "the-app-secret-FAKE") {
		t.Errorf("exchange error: %v", err)
	}
}

func signed(secret string, payload string) string {
	p := base64.RawURLEncoding.EncodeToString([]byte(payload))
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(p))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil)) + "." + p
}

func TestADeauthorizationIsBelievedOnlyWhenSignedWithTheAppSecret(t *testing.T) {
	c := channels.NewInstagram("id", secrets.NewSecret("ig-app-secret-FAKE"))
	deauth := func(s string) (string, error) { return c.Deauth(s) }
	if id, err := deauth(signed("ig-app-secret-FAKE", `{"algorithm":"HMAC-SHA256","user_id":"9988776655","issued_at":1}`)); err != nil || id != "9988776655" {
		t.Errorf("a good request: %q %v", id, err)
	}
	for name, s := range map[string]string{
		"another secret":  signed("not-the-secret", `{"user_id":"1"}`),
		"no signature":    "e30",
		"empty":           "",
		"no user":         signed("ig-app-secret-FAKE", `{"algorithm":"HMAC-SHA256","issued_at":1}`),
		"other algorithm": signed("ig-app-secret-FAKE", `{"algorithm":"HMAC-SHA1","user_id":"1"}`),
		"no algorithm":    signed("ig-app-secret-FAKE", `{"user_id":"1"}`),
		"garbage":         "!!!.???",
	} {
		if _, err := deauth(s); !errors.Is(err, channels.ErrBadSignedRequest) {
			t.Errorf("%s: %v", name, err)
		}
	}
}
