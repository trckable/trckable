package api

import (
	"bufio"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// A range that includes today is cached for 10 s, but a committed visit ends
// that entry at once: the next report counts it.
func TestLiveReportCacheFollowsCommits(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	url := g.srv.URL + "/api/v1/sites/" + g.site + "/report?from=2026-09-22&to=2026-09-22"
	visitors := func() float64 {
		t.Helper()
		code, out := do(t, c, "GET", url, "")
		if code != 200 {
			t.Fatalf("report: %d %v", code, out)
		}
		return out["current"].(map[string]any)["kpis"].(map[string]any)["visitors"].(float64)
	}
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 1, TS: g.now.UnixMilli(), Visitor: 1, Path: "/"})
	g.waitApplied(t, 1)
	if n := visitors(); n != 1 {
		t.Fatalf("visitors %v, want 1", n)
	}
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 2, TS: g.now.UnixMilli(), Visitor: 2, Path: "/"})
	g.waitApplied(t, 2)
	// A busy site commits every second; a live report waits out liveFloor
	// before it follows them, then follows the next commit at once.
	g.clock.Add((liveFloor + time.Second).Milliseconds())
	if n := visitors(); n != 2 {
		t.Fatalf("visitors %v after a new visit, want 2: the cache held the old report", n)
	}
	// Nothing new: the cached entry serves (same answer, no second query).
	if n := visitors(); n != 2 {
		t.Fatalf("visitors %v, want 2", n)
	}
}

// The stream says it is an event stream no proxy may transform, flushes a
// padded first chunk, and recounts Online right after a visit instead of on
// the next 15 s tick.
func TestLiveStreamRecountsOnlineAfterAVisit(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	c.Timeout = 0
	req, _ := http.NewRequest("GET", g.srv.URL+"/api/v1/sites/"+g.site+"/live", nil)
	resp, err := c.Do(req) //nolint:bodyclose // closed by the defer below; the linter loses track because a goroutine reads it
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if cc := resp.Header.Get("Cache-Control"); !strings.Contains(cc, "no-transform") || !strings.Contains(cc, "no-store") {
		t.Fatalf("cache-control %q", cc)
	}
	if resp.Header.Get("X-Accel-Buffering") != "no" {
		t.Fatal("X-Accel-Buffering missing")
	}
	lines := make(chan string, 64)
	go func() {
		sc := bufio.NewScanner(resp.Body)
		for sc.Scan() {
			lines <- sc.Text()
		}
		close(lines)
	}()
	next := func(want string) string {
		t.Helper()
		deadline := time.After(3 * time.Second)
		for {
			select {
			case l, ok := <-lines:
				if !ok {
					t.Fatal("stream closed")
				}
				if strings.HasPrefix(l, want) {
					return l
				}
			case <-deadline:
				t.Fatalf("no %q line", want)
			}
		}
	}
	next("retry: ")
	if l := next("data: "); l != `data: {"online":0}` {
		t.Fatalf("first count %s", l)
	}
	start := time.Now()
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 9, TS: g.now.UnixMilli(), Visitor: 9, Path: "/x"})
	next("event: visit")
	next("data: ")
	next("event: online")
	if l := next("data: "); l != `data: {"online":1}` {
		t.Fatalf("count after the visit %s", l)
	}
	if d := time.Since(start); d > 2*time.Second {
		t.Fatalf("online took %v", d)
	}
}
