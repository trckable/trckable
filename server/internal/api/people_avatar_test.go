package api

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"testing"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// A person's picture is shown to the people of the same account and to nobody
// else: not another account, not a key, not a share link.
func TestPersonAvatarIsForTheirOwnAccountOnly(t *testing.T) {
	g := newRig(t)
	ctx := context.Background()
	owner := client()
	g.setup(t, owner)
	picture := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{7}, 64)...)

	get := func(c *http.Client, id string, hdr ...string) (int, http.Header, []byte) {
		t.Helper()
		req, _ := http.NewRequest("GET", g.srv.URL+"/api/v1/people/"+id+"/avatar", nil)
		for i := 0; i+1 < len(hdr); i += 2 {
			req.Header.Set(hdr[i], hdr[i+1])
		}
		res, err := c.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		body, _ := io.ReadAll(res.Body)
		return res.StatusCode, res.Header, body
	}
	put := func(c *http.Client) {
		t.Helper()
		req, _ := http.NewRequest("PUT", g.srv.URL+"/api/v1/account/avatar", bytes.NewReader(picture))
		req.Header.Set(csrf, "1")
		res, err := c.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != http.StatusNoContent {
			t.Fatalf("put picture: %d", res.StatusCode)
		}
	}
	list := func() map[string]bool {
		t.Helper()
		_, out := do(t, owner, "GET", g.srv.URL+"/api/v1/people", "")
		has := map[string]bool{}
		for _, p := range out["people"].([]any) {
			m := p.(map[string]any)
			has[m["email"].(string)] = m["has_avatar"] == true
		}
		return has
	}
	idOf := func(email string) string {
		t.Helper()
		_, out := do(t, owner, "GET", g.srv.URL+"/api/v1/people", "")
		for _, p := range out["people"].([]any) {
			if m := p.(map[string]any); m["email"] == email {
				return m["id"].(string)
			}
		}
		t.Fatalf("no person %s", email)
		return ""
	}

	_, added := do(t, owner, "POST", g.srv.URL+"/api/v1/people", `{"email":"reader@site.com","role":"viewer"}`, csrf, "1")
	viewer := signInFirst(t, g, "reader@site.com", added["password"].(string))
	ownerID, viewerID := idOf("me@site.com"), idOf("reader@site.com")

	if has := list(); has["me@site.com"] || has["reader@site.com"] {
		t.Fatalf("nobody has a picture yet: %v", has)
	}
	if code, _, _ := get(viewer, ownerID); code != http.StatusNotFound {
		t.Errorf("no picture: %d, want 404", code)
	}

	put(owner)
	if has := list(); !has["me@site.com"] || has["reader@site.com"] {
		t.Fatalf("only the owner has one: %v", has)
	}
	// A viewer of the same account sees it, with the headers of your own picture.
	code, h, body := get(viewer, ownerID)
	if code != http.StatusOK || !bytes.Equal(body, picture) {
		t.Fatalf("viewer reads the owner's picture: %d", code)
	}
	if h.Get("Content-Type") != "image/png" || h.Get("Cache-Control") != "private, max-age=60" {
		t.Errorf("headers: %v", h)
	}
	if code, _, _ := get(owner, ownerID); code != http.StatusOK {
		t.Errorf("your own picture: %d", code)
	}
	if code, _, _ := get(owner, viewerID); code != http.StatusNotFound {
		t.Errorf("a person without a picture: %d, want 404", code)
	}
	put(viewer)
	if code, _, _ := get(owner, viewerID); code != http.StatusOK {
		t.Errorf("the owner reads a viewer's picture: %d", code)
	}

	// Everyone else: 404 or 401, and never the picture.
	accB, err := g.ctl.CreateAccount(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := g.ctl.AddUser(ctx, accB, "owner@other.com", "correct horse battery B", sqlite.RoleOwner); err != nil {
		t.Fatal(err)
	}
	other := client()
	if code, out := do(t, other, "POST", g.srv.URL+"/api/v1/login", `{"email":"owner@other.com","password":"correct horse battery B"}`); code != http.StatusOK {
		t.Fatalf("B signs in: %d %v", code, out)
	}
	if code, _, body := get(other, ownerID); code != http.StatusNotFound || bytes.Contains(body, picture) {
		t.Errorf("another account: %d, want 404", code)
	}
	if code, _, _ := get(client(), ownerID); code != http.StatusUnauthorized {
		t.Errorf("nobody: %d, want 401", code)
	}
	key, _, err := g.ctl.CreateAPIKey(ctx, sqlite.DefaultAccount, "avatar")
	if err != nil {
		t.Fatal(err)
	}
	if code, _, _ := get(client(), ownerID, "Authorization", "Bearer "+key); code != http.StatusNotFound {
		t.Errorf("an API key: %d, want 404", code)
	}
	_, out := do(t, owner, "POST", g.srv.URL+"/api/v1/sites/"+g.site+"/shares", `{"name":"x"}`, csrf, "1")
	url := out["url"].(string)
	visitor := client()
	if code, _ := do(t, visitor, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+url[len(url)-26:]+`"}`); code != http.StatusOK {
		t.Fatalf("open share: %d", code)
	}
	if code, _, _ := get(visitor, ownerID); code != http.StatusUnauthorized && code != http.StatusNotFound {
		t.Errorf("a share link visitor: %d, want 401 or 404", code)
	}

	// Removing it is seen at once, in the list and on the picture.
	if code, _ := do(t, owner, "DELETE", g.srv.URL+"/api/v1/account/avatar", "", csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("remove: %d", code)
	}
	if code, _, _ := get(viewer, ownerID); code != http.StatusNotFound {
		t.Errorf("after removal: %d, want 404", code)
	}
	if list()["me@site.com"] {
		t.Error("the list still says the owner has a picture")
	}
}
