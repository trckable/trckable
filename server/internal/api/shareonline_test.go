package api

import "testing"

// The count of visitors on the site now is the owner's to allow, link by link:
// off unless asked for, refused while off, and only ever the number.
func TestSharedOnlineCountIsOptInAndOnlyTheNumber(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	_, made := do(t, owner, "POST", g.srv.URL+"/api/v1/sites/"+g.site+"/shares", `{"name":"Client"}`, csrf, "1")
	url, _ := made["url"].(string)
	id := made["share"].(map[string]any)["id"].(string)
	patch := g.srv.URL + "/api/v1/sites/" + g.site + "/shares/" + id
	reader := client()
	code, info := do(t, reader, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+url[len(url)-26:]+`"}`)
	if code != 200 || info["live"] != false {
		t.Fatalf("a new link has the count off: %d %v", code, info["live"])
	}
	if code, _ := do(t, reader, "GET", g.srv.URL+"/api/v1/share/online", ""); code != 404 {
		t.Fatalf("off: want 404, got %d", code)
	}
	if code, rep := do(t, reader, "GET", g.srv.URL+"/api/v1/share/report", ""); code != 200 {
		t.Fatalf("report: %d", code)
	} else if _, has := rep["online"]; has {
		t.Fatal("a link with the count off must not carry it in its report either")
	}
	if code, _ := do(t, client(), "GET", g.srv.URL+"/api/v1/share/online", ""); code != 401 {
		t.Fatalf("no link opened: want 401, got %d", code)
	}
	if code, _ := do(t, reader, "PATCH", patch, `{"live":true}`, csrf, "1"); code == 200 {
		t.Fatal("a reader of the link must not change it")
	}
	if code, out := do(t, owner, "PATCH", patch, `{"live":true}`, csrf, "1"); code != 200 || out["live"] != true {
		t.Fatalf("owner turns it on: %d %v", code, out)
	}
	code, out := do(t, reader, "GET", g.srv.URL+"/api/v1/share/online", "")
	if code != 200 || len(out) != 1 {
		t.Fatalf("on: want just the count, got %d %v", code, out)
	}
	if _, ok := out["online"].(float64); !ok {
		t.Fatalf("the count is a number: %v", out)
	}
	if _, rep := do(t, reader, "GET", g.srv.URL+"/api/v1/share/report", ""); rep["online"] == nil {
		t.Fatal("with the count on, the report carries it")
	}
	if code, _ := do(t, owner, "PATCH", patch, `{"live":false}`, csrf, "1"); code != 200 {
		t.Fatal("owner turns it off")
	}
	if code, _ := do(t, reader, "GET", g.srv.URL+"/api/v1/share/online", ""); code != 404 {
		t.Fatalf("off again: want 404, got %d", code)
	}
}
