package api

import (
	"net/http"
	"testing"
	"time"
)

func busierOf(t *testing.T, g *rig, c *http.Client) map[string]any {
	t.Helper()
	code, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/busier", "")
	if code != http.StatusOK {
		t.Fatalf("busier: %d %v", code, out)
	}
	return out
}

// 40 online against a usual of 5: busier. The answer says who brings the
// difference (Facebook, its page, its country), what it usually is, and when
// the rise began.
func TestBusierSaysWhy(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	id := g.usualWeeks(t, 5)
	now := g.advance(0)
	id = g.crowd(t, id, 40, 30, now)
	g.waitApplied(t, id)

	out := busierOf(t, g, c)
	if out["state"] != "busier" || out["now"] != float64(40) || out["usual"] != float64(5) || out["baseline"] != true || out["basis"] != "weekday" {
		t.Fatalf("numbers: %v", out)
	}
	if out["low"] != float64(5) || out["high"] != float64(5) {
		t.Fatalf("range: %v", out)
	}
	why, _ := out["why"].([]any)
	if len(why) != 3 {
		t.Fatalf("top three: %v", why)
	}
	first, _ := why[0].(map[string]any)
	if first["dim"] != "source" || first["value"] != "Facebook" || first["now"] != float64(30) || first["usual"] != float64(0) || first["plus"] != float64(30) {
		t.Fatalf("first: %v", first)
	}
	second, _ := why[1].(map[string]any)
	if second["dim"] != "page" || second["value"] != "/blog/launch-post" || second["plus"] != float64(30) {
		t.Fatalf("second: %v", second)
	}
	// Facebook +30 and the 10 direct people who usually are 5: 5 more.
	if out["rest"] != float64(0) {
		t.Fatalf("rest: %v", out["rest"])
	}
	since, _ := out["since"].(float64)
	if since < float64(now.Add(-2*time.Minute).Unix()) || since > float64(now.Unix()) || out["since_capped"] != nil {
		t.Fatalf("since %v, now %d: %v", out["since"], now.Unix(), out)
	}
}

// A normal hour says nothing and does not go looking for reasons.
func TestBusierStaysQuietAsUsual(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	id := g.usualWeeks(t, 5)
	now := g.advance(0)
	id = g.crowd(t, id, 8, 0, now)
	g.waitApplied(t, id)
	out := busierOf(t, g, c)
	if out["state"] != "" || out["now"] != float64(8) || out["usual"] != float64(5) {
		t.Fatalf("%v", out)
	}
	if why, _ := out["why"].([]any); len(why) != 0 {
		t.Fatalf("no reasons for a normal hour: %v", why)
	}
}

// Quieter is worked out too, behind the same rule; the dashboard hides it.
func TestBusierQuieter(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	id := g.usualWeeks(t, 30)
	now := g.advance(0)
	id = g.crowd(t, id, 5, 0, now)
	g.waitApplied(t, id)
	if out := busierOf(t, g, c); out["state"] != "quieter" {
		t.Fatalf("%v", out)
	}
}

// Under a week of history there is no usual, so no verdict, however many are online.
func TestBusierNeedsAWeekOfHistory(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	now := g.advance(0)
	id := g.crowd(t, 0, 60, 40, now)
	g.waitApplied(t, id)
	out := busierOf(t, g, c)
	if out["baseline"] != false || out["state"] != "" || out["now"] != float64(60) {
		t.Fatalf("%v", out)
	}
}
