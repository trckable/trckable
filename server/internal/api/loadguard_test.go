package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/query"
)

func TestReportThatRanOutOfTimeIsAnUnavailableNotABadQuestion(t *testing.T) {
	for _, err := range []error{context.DeadlineExceeded, context.Canceled} {
		w := httptest.NewRecorder()
		reportFail(w, err)
		if w.Code != http.StatusGatewayTimeout || w.Header().Get("Retry-After") == "" {
			t.Errorf("%v: %d %v", err, w.Code, w.Header())
		}
	}
	w := httptest.NewRecorder()
	reportFail(w, context.Canceled)
	if !strings.Contains(w.Body.String(), "error") {
		t.Errorf("body: %s", w.Body.String())
	}
	w = httptest.NewRecorder()
	reportFail(w, http.ErrNotSupported)
	if w.Code != http.StatusBadRequest {
		t.Errorf("other errors stay 400: %d", w.Code)
	}
}

func TestIdenticalReportsShareOneRead(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	q := g.api.Query()
	p := query.Params{Site: g.site, From: g.now.AddDate(0, 0, -3), To: g.now.Add(time.Hour), TZ: "UTC", Bucket: "day"}
	req := httptest.NewRequest("GET", "/", nil)
	var wg sync.WaitGroup
	got := make([]*query.Result, 12)
	for i := range got {
		wg.Add(1)
		go func() {
			defer wg.Done()
			res, err := g.api.cachedReport(req, q, p)
			if err != nil {
				t.Error(err)
			}
			got[i] = res
		}()
	}
	wg.Wait()
	for i, r := range got {
		if r != got[0] {
			t.Fatalf("request %d got its own read", i)
		}
	}
}

func TestPublicShareReportIsRangedAndRateLimited(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	code, out := do(t, c, "POST", base+"/shares", `{"name":"x"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("create: %d %v", code, out)
	}
	url, _ := out["url"].(string)
	anon := client()
	if code, _ := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+url[len(url)-26:]+`"}`); code != 200 {
		t.Fatal("open")
	}
	if code, _ := do(t, anon, "GET", g.srv.URL+"/api/v1/share/report?from=2020-01-01&to=2026-09-22", ""); code != http.StatusBadRequest {
		t.Errorf("a six-year range on a public link: %d", code)
	}
	limited := false
	for range shareReportRate*sharedPeerFactor + 5 { // tests share one address: the ceiling is wider
		if code, _ := do(t, anon, "GET", g.srv.URL+"/api/v1/share/report?from=2026-09-22&to=2026-09-22", ""); code == http.StatusTooManyRequests {
			limited = true
			break
		}
	}
	if !limited {
		t.Error("one address read the public report without limit")
	}
}
