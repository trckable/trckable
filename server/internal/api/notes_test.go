package api

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// A note carries who left it; it can be reworded and moved; a bad day or no
// words is refused; a viewer reads notes but cannot change them.
func TestNotesAuthorEditAndRules(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/annotations"

	code, note := do(t, c, "POST", base, `{"day":"2026-09-20","text":"  Launch post  "}`, csrf, "1")
	if code != http.StatusCreated || note["text"] != "Launch post" || note["author"] != "me@site.com" {
		t.Fatalf("add: %d %v", code, note)
	}
	if _, ok := note["AuthorID"]; ok {
		t.Fatal("the author's id left the server")
	}
	id := note["id"].(string)
	for _, bad := range []string{`{"day":"2026-02-30","text":"x"}`, `{"day":"2026-09-20","text":"   "}`, `{"day":"20-09-2026","text":"x"}`} {
		if code, _ := do(t, c, "POST", base, bad, csrf, "1"); code != http.StatusBadRequest {
			t.Errorf("add %s: %d, want 400", bad, code)
		}
		if code, _ := do(t, c, "PATCH", base+"/"+id, bad, csrf, "1"); code != http.StatusBadRequest {
			t.Errorf("edit %s: %d, want 400", bad, code)
		}
	}
	code, edited := do(t, c, "PATCH", base+"/"+id, `{"day":"2026-09-21","text":"Launch post on LinkedIn"}`, csrf, "1")
	if code != http.StatusOK || edited["day"] != "2026-09-21" || edited["text"] != "Launch post on LinkedIn" || edited["author"] != "me@site.com" {
		t.Fatalf("edit: %d %v", code, edited)
	}
	if code, _ := do(t, c, "PATCH", base+"/note_nothere", `{"day":"2026-09-21","text":"x"}`, csrf, "1"); code != http.StatusNotFound {
		t.Errorf("edit of a missing note: %d", code)
	}
	long := strings.Repeat("é", sqlite.MaxAnnotationText+20)
	if _, out := do(t, c, "PATCH", base+"/"+id, `{"day":"2026-09-21","text":"`+long+`"}`, csrf, "1"); len([]rune(out["text"].(string))) != sqlite.MaxAnnotationText {
		t.Errorf("a long note was not cut to %d characters", sqlite.MaxAnnotationText)
	}

	// A viewer of the account reads them and changes nothing.
	ctx := context.Background()
	if _, err := g.ctl.AddUser(ctx, sqlite.DefaultAccount, "viewer@site.com", "correct horse battery V", sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	v := client()
	if code, out := do(t, v, "POST", g.srv.URL+"/api/v1/login", `{"email":"viewer@site.com","password":"correct horse battery V"}`); code != http.StatusOK {
		t.Fatalf("viewer signs in: %d %v", code, out)
	}
	if code, out := do(t, v, "GET", base+"?from=2026-09-01&to=2026-09-30", ""); code != 200 || len(out["annotations"].([]any)) != 1 {
		t.Fatalf("viewer reads notes: %d %v", code, out)
	}
	for _, m := range []string{"PATCH", "DELETE"} {
		if code, _ := do(t, v, m, base+"/"+id, `{"day":"2026-09-21","text":"mine now"}`, csrf, "1"); code != http.StatusForbidden {
			t.Errorf("viewer %s: %d, want 403", m, code)
		}
	}
	if code, _ := do(t, v, "POST", base, `{"day":"2026-09-21","text":"mine"}`, csrf, "1"); code != http.StatusForbidden {
		t.Errorf("viewer add: %d, want 403", code)
	}
}

// A share link shows the chart's notes only when the owner turned them on,
// and never who wrote them.
func TestShareShowsNotesOnlyWhenAllowed(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	if code, _ := do(t, c, "POST", base+"/annotations", `{"day":"2026-09-20","text":"Price change"}`, csrf, "1"); code != http.StatusCreated {
		t.Fatal("add note")
	}
	code, out := do(t, c, "POST", base+"/shares", `{"name":"Investors"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("create: %d %v", code, out)
	}
	sh := out["share"].(map[string]any)
	if sh["notes"] != false {
		t.Fatalf("a new link shows notes unless asked: %v", sh)
	}
	url := out["url"].(string)
	token := url[len(url)-26:]
	anon := client()
	code, info := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+token+`"}`)
	if code != 200 || info["notes"] != false {
		t.Fatalf("open: %d %v", code, info)
	}
	notes := func() []any {
		t.Helper()
		code, out := do(t, anon, "GET", g.srv.URL+"/api/v1/share/annotations?from=2026-09-01&to=2026-09-30", "")
		if code != 200 {
			t.Fatalf("share notes: %d %v", code, out)
		}
		return out["annotations"].([]any)
	}
	if n := notes(); len(n) != 0 {
		t.Fatalf("the link showed notes it was not allowed to: %v", n)
	}

	// Only the owner flips it, and only on a link of this site.
	id := sh["id"].(string)
	if code, _ := do(t, anon, "PATCH", base+"/shares/"+id, `{"notes":true}`, csrf, "1"); code != http.StatusUnauthorized {
		t.Errorf("anyone flipped the switch: %d", code)
	}
	if code, _ := do(t, c, "PATCH", base+"/shares/shr_nothere", `{"notes":true}`, csrf, "1"); code != http.StatusNotFound {
		t.Errorf("a missing link: %d", code)
	}
	if code, _ := do(t, c, "PATCH", base+"/shares/"+id, `{}`, csrf, "1"); code != http.StatusBadRequest {
		t.Errorf("no switch in the body: %d", code)
	}
	if code, out := do(t, c, "PATCH", base+"/shares/"+id, `{"notes":true}`, csrf, "1"); code != 200 || out["notes"] != true {
		t.Fatalf("turn on: %d %v", code, out)
	}
	n := notes()
	if len(n) != 1 || n[0].(map[string]any)["text"] != "Price change" {
		t.Fatalf("the allowed notes: %v", n)
	}
	if _, ok := n[0].(map[string]any)["author"]; ok {
		t.Fatalf("a share link carried the author: %v", n[0])
	}
	if _, out := do(t, c, "GET", base+"/shares", ""); out["shares"].([]any)[0].(map[string]any)["notes"] != true {
		t.Fatal("the owner's list does not show the switch on")
	}
	if code, _ := do(t, c, "PATCH", base+"/shares/"+id, `{"notes":false}`, csrf, "1"); code != 200 || len(notes()) != 0 {
		t.Fatal("turning it off did not hide the notes at once")
	}
}
