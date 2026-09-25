package api

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/trckable/trckable/server/internal/gsc"
)

// fakeSearchConsole stands in for Google: any assertion gets a token, and
// the property list and the search report are fixed.
func fakeSearchConsole(t *testing.T) (queries *atomic.Int32, last *map[string]any) {
	t.Helper()
	queries = &atomic.Int32{}
	var body map[string]any
	last = &body
	mux := http.NewServeMux()
	mux.HandleFunc("POST /token", func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, `{"access_token":"tok","expires_in":3600}`)
	})
	mux.HandleFunc("GET /v3/sites", func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, `{"siteEntry":[{"siteUrl":"https://other.com/","permissionLevel":"siteOwner"},{"siteUrl":"sc-domain:site.com","permissionLevel":"siteFullUser"}]}`)
	})
	mux.HandleFunc("POST /v3/sites/{prop}/searchAnalytics/query", func(w http.ResponseWriter, r *http.Request) {
		queries.Add(1)
		body = map[string]any{}
		json.NewDecoder(r.Body).Decode(&body)
		io.WriteString(w, `{"rows":[{"keys":["self hosted analytics"],"clicks":31,"impressions":620,"ctr":0.05,"position":4.4},
			{"keys":["trckable"],"clicks":12,"impressions":40,"ctr":0.3,"position":1.2}]}`)
	})
	srv := httptest.NewServer(mux)
	oldT, oldA := gsc.TokenURL, gsc.APIBase
	gsc.TokenURL, gsc.APIBase = srv.URL+"/token", srv.URL+"/v3"
	t.Cleanup(func() { srv.Close(); gsc.TokenURL, gsc.APIBase = oldT, oldA })
	return queries, last
}

func serviceAccountKey(t *testing.T) string {
	t.Helper()
	pk, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	der, _ := x509.MarshalPKCS8PrivateKey(pk)
	b, _ := json.Marshal(map[string]string{
		"type": "service_account", "client_email": "reader@proj.iam.gserviceaccount.com",
		"private_key": string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})),
	})
	return string(b)
}

func TestSearchConsoleEndToEnd(t *testing.T) {
	queries, last := fakeSearchConsole(t)
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site

	if code, out := do(t, c, "GET", base+"/search-console", ""); code != 200 || out["connected"] != false {
		t.Fatalf("before connecting: %d %v", code, out)
	}
	if code, _ := do(t, c, "GET", base+"/report/search", ""); code != http.StatusNotFound {
		t.Fatalf("the report must stay off until the module is on: %d", code)
	}
	if code, out := do(t, c, "PUT", base+"/search-console", `{"key":"{\"type\":\"authorized_user\"}"}`, csrf, "1"); code != 400 || !strings.Contains(out["error"].(string), "service account") {
		t.Fatalf("an OAuth client file: %d %v", code, out)
	}

	key, _ := json.Marshal(map[string]string{"key": serviceAccountKey(t)})
	code, out := do(t, c, "PUT", base+"/search-console", string(key), csrf, "1")
	if code != 200 {
		t.Fatalf("connect: %d %v", code, out)
	}
	conn := out["connection"].(map[string]any)
	if conn["property"] != "sc-domain:site.com" || conn["client_email"] != "reader@proj.iam.gserviceaccount.com" {
		t.Fatalf("the property matching the site must be picked: %v", conn)
	}
	if _, leaked := conn["key_enc"]; leaked {
		t.Fatal("the sealed key is sent back to the browser")
	}
	var stored string
	g.ctl.DB.QueryRow(`SELECT key_enc FROM search_console WHERE site_id = ?`, g.site).Scan(&stored)
	if stored == "" || strings.Contains(stored, "PRIVATE KEY") {
		t.Fatal("the key is not stored sealed")
	}

	code, out = do(t, c, "GET", base+"/report/search?from=2026-09-01&to=2026-09-21&dim=query&f=page:/pricing&f=country:DE", "")
	if code != 200 {
		t.Fatalf("report: %d %v", code, out)
	}
	if rows := out["rows"].([]any); len(rows) != 2 || out["clicks"] != float64(43) {
		t.Fatalf("report = %v", out)
	}
	if q := *last; q["startDate"] != "2026-09-01" || q["endDate"] != "2026-09-21" {
		t.Fatalf("Google was asked for %v, not the dashboard's period", q)
	}
	if ig := out["ignored_filters"].([]any); len(ig) != 1 || ig[0] != "country" {
		t.Fatalf("ignored filters = %v", ig)
	}
	do(t, c, "GET", base+"/report/search?from=2026-09-01&to=2026-09-21&dim=query&f=page:/pricing", "")
	if n := queries.Load(); n != 1 {
		t.Fatalf("the same report asked Google %d times within the hour", n)
	}

	if code, out := do(t, c, "PUT", base+"/search-console", `{"property":"https://not-mine.com/"}`, csrf, "1"); code != 400 || !strings.Contains(out["error"].(string), "reader@proj") {
		t.Fatalf("a property the account cannot read: %d %v", code, out)
	}

	// A viewer reads the report but cannot change the connection.
	_, p := do(t, c, "POST", g.srv.URL+"/api/v1/people", `{"email":"reader@site.com","role":"viewer"}`, csrf, "1")
	viewer := signInFirst(t, g, "reader@site.com", p["password"].(string))
	if code, _ := do(t, viewer, "GET", base+"/report/search", ""); code != 200 {
		t.Fatalf("viewer report: %d", code)
	}
	if code, _ := do(t, viewer, "DELETE", base+"/search-console", "", csrf, "1"); code != http.StatusForbidden {
		t.Fatalf("viewer disconnect: %d", code)
	}

	if code, _ := do(t, c, "DELETE", base+"/search-console", "", csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("disconnect: %d", code)
	}
	if code, _ := do(t, c, "GET", base+"/report/search", ""); code != http.StatusConflict {
		t.Fatalf("report after disconnecting: %d", code)
	}
}
