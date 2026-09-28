package api

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// A data request: find the person, hand over what is held, then erase it —
// and say plainly what an erasure does not touch.
func TestDataRequest(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)

	base := g.now.Add(-2 * time.Hour)
	for _, e := range []event.Event{
		{Kind: event.KindPageview, EventID: 1, Visitor: 7, Path: "/", TS: base.UnixMilli(), Country: "DE"},
		{Kind: event.KindPageview, EventID: 2, Visitor: 7, Path: "/pricing", TS: base.Add(time.Minute).UnixMilli()},
		{Kind: event.KindPageview, EventID: 3, Visitor: 9, Path: "/", TS: base.Add(2 * time.Minute).UnixMilli()},
	} {
		g.event(t, e)
	}
	g.waitApplied(t, 3)

	url := g.srv.URL + "/api/v1/sites/" + g.site + "/privacy/person?visitor=7"
	code, out := do(t, c, "GET", url, "")
	if code != 200 {
		t.Fatalf("find: %d %v", code, out)
	}
	found := out["found"].(map[string]any)
	if found["visitor"] != "7" || found["events"] != 2.0 {
		t.Fatalf("found: %v", found)
	}

	// The export is a file, not a JSON envelope, so read it as one.
	req, _ := http.NewRequest("GET", g.srv.URL+"/api/v1/sites/"+g.site+"/privacy/export?visitor=7", nil)
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if cd := resp.Header.Get("Content-Disposition"); cd == "" {
		t.Error("the export is not offered as a file")
	}
	var file struct {
		Export struct {
			Visitor string `json:"visitor"`
			Note    string `json:"note"`
			Visits  []struct {
				Events []struct{ Path string } `json:"events"`
			} `json:"visits"`
		} `json:"export"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&file); err != nil {
		t.Fatal(err)
	}
	if file.Export.Visitor != "7" || file.Export.Note == "" || len(file.Export.Visits) != 1 {
		t.Fatalf("export: %+v", file.Export)
	}
	if len(file.Export.Visits[0].Events) != 2 {
		t.Fatalf("the export is missing pages: %+v", file.Export.Visits[0].Events)
	}

	// An unknown email is a clear no, not an empty answer.
	if code, _ := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/privacy/person?email=nobody@site.com", ""); code != http.StatusNotFound {
		t.Errorf("unknown email: %d", code)
	}
	if code, _ := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/privacy/person", ""); code != http.StatusBadRequest {
		t.Errorf("no identifier at all: %d", code)
	}

	code, out = do(t, c, "DELETE", g.srv.URL+"/api/v1/sites/"+g.site+"/privacy/person?visitor=7", "", csrf, "1")
	if code != 200 || out["events"] != 2.0 {
		t.Fatalf("erase: %d %v", code, out)
	}
	// Their visit was still open, so it lives in memory rather than in a row —
	// and it is still a visit the owner was shown.
	if out["sessions"] != 1.0 {
		t.Fatalf("an open visit was not counted: %v", out)
	}
	if _, out := do(t, c, "GET", url, ""); out["found"].(map[string]any)["events"] != 0.0 {
		t.Fatalf("something was left behind: %v", out)
	}
	// The other visitor is untouched.
	if _, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/privacy/person?visitor=9", ""); out["found"].(map[string]any)["events"] != 1.0 {
		t.Fatalf("the erase reached someone else: %v", out)
	}
}
