package api

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func TestFeedbackIsKeptForOwners(t *testing.T) {
	g := newRig(t)
	g.api.Version = "9.9.9"
	owner := client()
	g.setup(t, owner)
	url := g.srv.URL + "/api/v1/feedback"

	if code, _ := do(t, client(), "POST", url, `{"message":"hi"}`); code != http.StatusUnauthorized {
		t.Fatalf("signed out: %d", code)
	}
	long := strings.Repeat("x", sqlite.MaxFeedback+1)
	if code, _ := do(t, owner, "POST", url, `{"message":"`+long+`"}`, csrf, "1"); code != http.StatusBadRequest {
		t.Fatalf("too long: %d", code)
	}
	if code, _ := do(t, owner, "POST", url, `{"message":"Love it","site":"`+g.site+`","path":"/sites/x"}`, csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("send: %d", code)
	}
	if code, out := do(t, owner, "GET", g.srv.URL+"/api/v1/admin/feedback", ""); code != http.StatusOK {
		t.Fatalf("list: %d", code)
	} else if list, _ := out["feedback"].([]any); len(list) != 1 || list[0].(map[string]any)["message"] != "Love it" || list[0].(map[string]any)["version"] != "9.9.9" {
		t.Fatalf("stored: %v", out)
	}

	// A viewer may send a note, and may not read them.
	if _, err := g.ctl.AddUser(context.Background(), sqlite.DefaultAccount, "viewer@site.com", "correct horse battery V", sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	v := client()
	if code := g.loginWith(t, v, "viewer@site.com", "correct horse battery V"); code != http.StatusOK {
		t.Fatalf("viewer sign-in: %d", code)
	}
	if code, _ := do(t, v, "POST", url, `{"message":"From a viewer"}`, csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("viewer send: %d", code)
	}
	if code, _ := do(t, v, "GET", g.srv.URL+"/api/v1/admin/feedback", ""); code != http.StatusForbidden {
		t.Fatalf("viewer list: %d", code)
	}
}
