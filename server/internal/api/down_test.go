package api

import (
	"context"
	"testing"
)

// A site the uptime probe finds not answering says so in the sites list and in
// the single site, with since when and why; one failed probe is not enough.
func TestSitesSayWhenTheyAreDown(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	ctx := context.Background()
	say := func(url string) map[string]any {
		t.Helper()
		_, out := do(t, c, "GET", g.srv.URL+url, "")
		if l, ok := out["sites"].([]any); ok {
			return l[0].(map[string]any)
		}
		return out
	}
	for _, url := range []string{"/api/v1/sites", "/api/v1/sites/" + g.site} {
		if v := say(url)["down_since"]; v != nil {
			t.Fatalf("%s: a site never probed is down: %v", url, v)
		}
	}
	g.ctl.RecordProbe(ctx, g.site, 1000, 0, "No answer within 10 seconds")
	if v := say("/api/v1/sites")["down_since"]; v != nil {
		t.Fatalf("one failed probe is a blip: %v", v)
	}
	g.ctl.RecordProbe(ctx, g.site, 1300, 0, "No answer within 10 seconds")
	for _, url := range []string{"/api/v1/sites", "/api/v1/sites/" + g.site} {
		got := say(url)
		if got["down_since"] != float64(1000) || got["down_cause"] != "No answer within 10 seconds" {
			t.Fatalf("%s: %v %v", url, got["down_since"], got["down_cause"])
		}
	}
	g.ctl.RecordProbe(ctx, g.site, 1600, 200, "")
	if v := say("/api/v1/sites")["down_since"]; v != nil {
		t.Fatalf("a site that answers again is still down: %v", v)
	}
}
