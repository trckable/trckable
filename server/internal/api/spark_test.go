package api

import (
	"net/http"
	"strings"
	"testing"
)

// A quiet site answers with a row of zeros per day, and the questions are
// bounded: a known column, a few rows, a month and a bit, one day.
func TestSparksAndUsualRoutes(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	today := g.api.Now().UTC()
	day := func(back int) string { return today.AddDate(0, 0, -back).Format("2006-01-02") }

	if code, _, _ := get(t, client(), base+"/sparks?dim=referrer&v=a.com"); code != http.StatusUnauthorized {
		t.Fatalf("signed out: %d", code)
	}
	q := "?dim=referrer&v=a.com&v=b.org&from=" + day(29) + "&to=" + day(0)
	code, _, body := get(t, owner, base+"/sparks"+q)
	if code != http.StatusOK || !strings.Contains(body, `"a.com":[0,0,`) || strings.Count(body, "0,") < 58 {
		t.Fatalf("sparks: %d %s", code, body)
	}
	for name, bad := range map[string]string{
		"an unknown column": "?dim=password&v=x&from=" + day(29) + "&to=" + day(0),
		"no rows":           "?dim=referrer&from=" + day(29) + "&to=" + day(0),
		"a long range":      "?dim=referrer&v=x&from=" + day(200) + "&to=" + day(0),
	} {
		if code, _, _ := get(t, owner, base+"/sparks"+bad); code != http.StatusBadRequest {
			t.Errorf("%s: %d, want 400", name, code)
		}
	}

	code, _, body = get(t, owner, base+"/usual?from="+day(0)+"&to="+day(0))
	if code != http.StatusOK || !strings.Contains(body, `"average":0`) || !strings.Contains(body, `"weeks":null`) && !strings.Contains(body, `"weeks":[]`) {
		t.Fatalf("usual: %d %s", code, body)
	}
	if code, _, _ = get(t, owner, base+"/usual?from="+day(7)+"&to="+day(0)); code != http.StatusBadRequest {
		t.Fatalf("usual for a week: %d", code)
	}
}
