package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestSnippetIn(t *testing.T) {
	for _, c := range []struct{ page, want string }{
		{`<script defer src="https://stats.x.com/js/tkb_abc.js"></script>`, "site"},
		{`<script>window.cfg={site:"tkb_abc"}</script>`, "site"},
		{`<script defer src="https://stats.x.com/js/tkb_other.js"></script>`, "other"},
		{`<script src="/_next/static/trckable-chunk.js"></script>`, "nosite"},
		{`<script defer src="https://stats.x.com/js/t.js"></script><!-- trckable -->`, "nosite"},
		{`<script>init({site:'tkb_zzzzzzzzzzzz'})</script>`, "other"},
		{`<meta name="k" content="tkb_live_abcdef">trckable`, "nosite"},
		{`<html><head></head></html>`, "none"},
	} {
		if got := snippetIn(c.page, "tkb_abc"); got != c.want {
			t.Errorf("%q: got %s, want %s", c.page, got, c.want)
		}
	}
}

func TestScriptURLs(t *testing.T) {
	base, _ := url.Parse("https://shop.example/en/")
	page := `<script src="https://cdn.other.net/a.js"></script>
		<script type="module" src="/_next/app.js"></script>
		<script src='chunk.js' defer></script>
		<script src="data:text/javascript,1"></script>
		<script>inline()</script>
		<script src="/_next/app.js"></script>`
	got := scriptURLs(page, base)
	want := []string{"https://shop.example/_next/app.js", "https://shop.example/en/chunk.js", "https://cdn.other.net/a.js"}
	if len(got) != len(want) {
		t.Fatalf("got %v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

// A check is remembered and travels with the site, so the picker can show an
// install that stopped working.
func TestCheckIsRemembered(t *testing.T) {
	was := checkClient
	defer func() { checkClient = was }()
	checkClient = func() *http.Client {
		return &http.Client{Transport: roundTrip(func(*http.Request) (*http.Response, error) { return nil, errors.New("no network in tests") })}
	}
	g := newRig(t)
	c := client()
	g.setup(t, c)
	if code, out := do(t, c, "POST", g.srv.URL+"/api/v1/sites/"+g.site+"/install/check", "", csrf, "1"); code != http.StatusOK || out["error"] == nil {
		t.Fatalf("check of a site that cannot be reached: %d %v", code, out)
	}
	_, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites", "")
	site := out["sites"].([]any)[0].(map[string]any)
	check, ok := site["check"].(map[string]any)
	if !ok || check["at"].(float64) == 0 || check["error"] == "" {
		t.Fatalf("the check travels with the site: %v", site)
	}
}

// The daily check skips suspended accounts, reads at most verifyPerAccount
// of one account's sites a day (the ones waiting longest first, so they take
// turns), and never more than verifyWorkers pages at once.
func TestDailyCheckIsCappedAndBounded(t *testing.T) {
	var (
		mu               sync.Mutex
		seen             = map[string]int{}
		inFlight, most   atomic.Int32
		wasClient, pause = checkClient, verifyPause
	)
	defer func() { checkClient, verifyPause = wasClient, pause }()
	verifyPause = 0
	checkClient = func() *http.Client {
		return &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
			n := inFlight.Add(1)
			defer inFlight.Add(-1)
			for m := most.Load(); n > m && !most.CompareAndSwap(m, n); m = most.Load() {
			}
			mu.Lock()
			seen[r.URL.Host]++
			mu.Unlock()
			time.Sleep(20 * time.Millisecond)
			return nil, errors.New("no network in tests")
		})}
	}
	g := newRig(t)
	g.setup(t, client())
	ctx := context.Background()
	account := func(prefix string, sites int) string {
		acc, err := g.ctl.CreateAccount(ctx)
		if err != nil {
			t.Fatal(err)
		}
		for i := range sites {
			if _, err := g.ctl.CreateSite(ctx, acc, fmt.Sprintf("%s-%d.example.com", prefix, i), ""); err != nil {
				t.Fatal(err)
			}
		}
		return acc
	}
	account("big", verifyPerAccount+10)
	account("small", 2)
	checked := map[string]bool{}
	count := func() map[string]int {
		mu.Lock()
		defer mu.Unlock()
		out := map[string]int{}
		for host, n := range seen {
			out[strings.SplitN(host, "-", 2)[0]] += n
			checked[host] = true
		}
		clear(seen)
		return out
	}

	g.api.VerifyAll(ctx)
	got := count()
	if got["big"] != verifyPerAccount || got["small"] != 2 {
		t.Fatalf("first day: %v", got)
	}
	if m := most.Load(); m > verifyWorkers || m < 2 {
		t.Fatalf("%d pages read at once, want 2 to %d", m, verifyWorkers)
	}

	// The same day again (a restart): every account has had its share.
	g.api.VerifyAll(ctx)
	if got := count(); got["big"]+got["small"] != 0 {
		t.Fatalf("a second run the same day: %v", got)
	}

	// A day later the big account's sites never checked go first.
	if _, err := g.ctl.DB.ExecContext(ctx, `UPDATE site_check SET checked_at = checked_at - 25*3600`); err != nil {
		t.Fatal(err)
	}
	g.api.VerifyAll(ctx)
	mu.Lock()
	for i := range verifyPerAccount + 10 {
		if host := fmt.Sprintf("big-%d.example.com", i); !checked[host] && seen[host] != 1 {
			t.Errorf("%s waited another day", host)
		}
	}
	mu.Unlock()
	if got := count(); got["big"] != verifyPerAccount || got["small"] != 2 {
		t.Fatalf("next day: %v", got)
	}
}

// "I've installed it" in the dashboard: the owner asks, the server reads the
// site's homepage (here a local page standing in for https://site.com/, which
// the real guarded client would never dial) and says what it found — and a
// busy button cannot turn it into a flood.
func TestCheckOnDemandFindsTheSnippetAndIsLimited(t *testing.T) {
	g := newRig(t)
	var reads atomic.Int32
	page := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reads.Add(1)
		fmt.Fprintf(w, `<html><head><script
  defer
  data-site="%s"
  data-domain="site.com"
  src="https://stats.example/js/%s.js">
</script></head></html>`, g.site, g.site)
	}))
	defer page.Close()
	was := checkClient
	defer func() { checkClient = was }()
	checkClient = func() *http.Client {
		return &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
			if r.URL.Host != "site.com" {
				return nil, errors.New("only the site's own homepage in this test")
			}
			u, _ := url.Parse(page.URL)
			r2 := r.Clone(r.Context())
			r2.URL.Scheme, r2.URL.Host = u.Scheme, u.Host
			res, err := http.DefaultTransport.RoundTrip(r2)
			if res != nil {
				res.Request = r
			}
			return res, err
		})}
	}
	c := client()
	g.setup(t, c)
	check := g.srv.URL + "/api/v1/sites/" + g.site + "/install/check"
	code, out := do(t, c, "POST", check, "", csrf, "1")
	if code != http.StatusOK || out["found"] != "site" || out["via"] != "page" || out["url"] != "https://site.com/" {
		t.Fatalf("a page carrying the snippet: %d %v", code, out)
	}
	if code, _ := do(t, client(), "POST", check, "", csrf, "1"); code != http.StatusUnauthorized {
		t.Fatalf("signed out: %d", code)
	}
	for i := 1; i < 10; i++ {
		if code, _ := do(t, c, "POST", check, "", csrf, "1"); code != http.StatusOK {
			t.Fatalf("check %d of 10: %d", i+1, code)
		}
	}
	if code, out := do(t, c, "POST", check, "", csrf, "1"); code != http.StatusTooManyRequests || out["error"] == nil {
		t.Fatalf("the eleventh check in ten minutes: %d %v", code, out)
	}
	if n := reads.Load(); n != 10 {
		t.Fatalf("the site was read %d times, want 10: a refused check reads nothing", n)
	}
}
