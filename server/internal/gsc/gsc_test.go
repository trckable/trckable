package gsc

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// A stand-in for Google: a token endpoint that checks the signed assertion
// the way Google does, and the two Search Console endpoints.
type fakeGoogle struct {
	*httptest.Server
	pub       *rsa.PublicKey
	exchanges atomic.Int32
	lastQuery map[string]any
	lastPath  string
}

func newFakeGoogle(t *testing.T, pub *rsa.PublicKey) *fakeGoogle {
	t.Helper()
	g := &fakeGoogle{pub: pub}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /token", func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		if r.Form.Get("grant_type") != "urn:ietf:params:oauth:grant-type:jwt-bearer" {
			http.Error(w, `{"error":"unsupported_grant_type"}`, 400)
			return
		}
		parts := strings.Split(r.Form.Get("assertion"), ".")
		if len(parts) != 3 {
			http.Error(w, `{"error":"invalid_grant"}`, 400)
			return
		}
		sig, _ := base64.RawURLEncoding.DecodeString(parts[2])
		sum := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
		if rsa.VerifyPKCS1v15(g.pub, crypto.SHA256, sum[:], sig) != nil {
			w.WriteHeader(400)
			io.WriteString(w, `{"error":"invalid_grant","error_description":"Invalid JWT Signature."}`)
			return
		}
		raw, _ := base64.RawURLEncoding.DecodeString(parts[1])
		var c map[string]any
		json.Unmarshal(raw, &c)
		if c["scope"] != Scope || c["aud"] != TokenURL || c["iss"] != "reader@proj.iam.gserviceaccount.com" {
			http.Error(w, `{"error":"invalid_grant"}`, 400)
			return
		}
		n := g.exchanges.Add(1)
		fmt.Fprintf(w, `{"access_token":"tok-%d","expires_in":3600,"token_type":"Bearer"}`, n)
	})
	authed := func(w http.ResponseWriter, r *http.Request) bool {
		if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer tok-") {
			w.WriteHeader(401)
			io.WriteString(w, `{"error":{"code":401,"message":"Request had invalid authentication credentials."}}`)
			return false
		}
		return true
	}
	mux.HandleFunc("GET /webmasters/v3/sites", func(w http.ResponseWriter, r *http.Request) {
		if !authed(w, r) {
			return
		}
		io.WriteString(w, `{"siteEntry":[
			{"siteUrl":"sc-domain:example.com","permissionLevel":"siteFullUser"},
			{"siteUrl":"https://blog.example.com/","permissionLevel":"siteRestrictedUser"},
			{"siteUrl":"https://other.com/","permissionLevel":"siteUnverifiedUser"}]}`)
	})
	mux.HandleFunc("POST /webmasters/v3/sites/{prop}/searchAnalytics/query", func(w http.ResponseWriter, r *http.Request) {
		if !authed(w, r) {
			return
		}
		g.lastPath = r.URL.EscapedPath()
		g.lastQuery = map[string]any{}
		json.NewDecoder(r.Body).Decode(&g.lastQuery)
		if dims, _ := g.lastQuery["dimensions"].([]any); len(dims) == 1 && dims[0] == "page" {
			io.WriteString(w, `{"rows":[
				{"keys":["https://example.com/pricing?ref=x"],"clicks":40,"impressions":900,"ctr":0.044,"position":6.2},
				{"keys":["https://www.example.com/"],"clicks":12,"impressions":300,"ctr":0.04,"position":3.1}]}`)
			return
		}
		io.WriteString(w, `{"rows":[
			{"keys":["self hosted analytics"],"clicks":31,"impressions":620,"ctr":0.05,"position":4.4},
			{"keys":["plausible alternative"],"clicks":9,"impressions":410,"ctr":0.022,"position":8.9}]}`)
	})
	g.Server = httptest.NewServer(mux)
	t.Cleanup(g.Close)
	return g
}

// TestKey returns a service account key file, as Google hands it out.
func testKey(t *testing.T) ([]byte, *rsa.PrivateKey) {
	t.Helper()
	pk, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	der, _ := x509.MarshalPKCS8PrivateKey(pk)
	file, _ := json.Marshal(map[string]string{
		"type":         "service_account",
		"client_email": "reader@proj.iam.gserviceaccount.com",
		"private_key":  string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})),
		// A key file names its own token endpoint. It is never used: the
		// signed assertion only ever goes to Google's.
		"token_uri": "https://evil.example/token",
	})
	return file, pk
}

func pointAt(t *testing.T, g *fakeGoogle) {
	t.Helper()
	oldT, oldA := TokenURL, APIBase
	TokenURL, APIBase = g.URL+"/token", g.URL+"/webmasters/v3"
	t.Cleanup(func() { TokenURL, APIBase = oldT, oldA })
}

func TestParseKeyRefusesWhatItCannotUse(t *testing.T) {
	good, _ := testKey(t)
	if _, err := ParseKey(good); err != nil {
		t.Fatalf("a real key: %v", err)
	}
	for name, raw := range map[string]string{
		"not json":     `hello`,
		"oauth client": `{"type":"authorized_user","client_email":"a@b.c","private_key":"x"}`,
		"no email":     `{"type":"service_account","private_key":"x"}`,
		"broken pem":   `{"type":"service_account","client_email":"a@b.c","private_key":"-----BEGIN PRIVATE KEY-----\nnope\n"}`,
	} {
		if _, err := ParseKey([]byte(raw)); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}

func TestSignsInAndKeepsTheToken(t *testing.T) {
	raw, pk := testKey(t)
	g := newFakeGoogle(t, &pk.PublicKey)
	pointAt(t, g)
	k, _ := ParseKey(raw)
	now := time.Date(2026, 9, 23, 10, 0, 0, 0, time.UTC)
	c := New(k)
	c.Now = func() time.Time { return now }
	ctx := context.Background()

	ps, err := c.Properties(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(ps) != 2 || ps[0].URL != "sc-domain:example.com" {
		t.Fatalf("properties = %+v (an unverified one must be left out)", ps)
	}
	if _, err := c.Properties(ctx); err != nil {
		t.Fatal(err)
	}
	if n := g.exchanges.Load(); n != 1 {
		t.Fatalf("token exchanged %d times for two calls within the hour", n)
	}
	now = now.Add(59*time.Minute + 30*time.Second) // inside the last minute: renew
	if _, err := c.Properties(ctx); err != nil {
		t.Fatal(err)
	}
	if n := g.exchanges.Load(); n != 2 {
		t.Fatalf("token not renewed before it expired: %d exchanges", n)
	}
}

func TestAWrongKeyIsRefusedWithGooglesReason(t *testing.T) {
	raw, _ := testKey(t)
	_, other := testKey(t) // Google knows a different key for this account
	g := newFakeGoogle(t, &other.PublicKey)
	pointAt(t, g)
	k, _ := ParseKey(raw)
	_, err := New(k).Properties(context.Background())
	if err == nil || !strings.Contains(err.Error(), "Invalid JWT Signature") {
		t.Fatalf("err = %v", err)
	}
}

func TestSearchAsksForWhatTheReportShows(t *testing.T) {
	raw, pk := testKey(t)
	g := newFakeGoogle(t, &pk.PublicKey)
	pointAt(t, g)
	k, _ := ParseKey(raw)
	c := New(k)
	ctx := context.Background()
	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC)

	rows, err := c.Search(ctx, "sc-domain:example.com", Query{From: from, To: to, Dimension: "query", Page: "/pricing", Device: "MOBILE"})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 || rows[0].Key != "self hosted analytics" || rows[0].Clicks != 31 {
		t.Fatalf("rows = %+v", rows)
	}
	q := g.lastQuery
	if q["startDate"] != "2026-09-01" || q["endDate"] != "2026-09-30" || q["dataState"] != "all" || q["rowLimit"] != float64(100) {
		t.Errorf("query = %v", q)
	}
	if want := "/webmasters/v3/sites/" + url.PathEscape("sc-domain:example.com") + "/searchAnalytics/query"; g.lastPath != want {
		t.Errorf("path = %s, want %s", g.lastPath, want)
	}
	filters := q["dimensionFilterGroups"].([]any)[0].(map[string]any)["filters"].([]any)
	if len(filters) != 2 {
		t.Fatalf("filters = %v", filters)
	}
	page := filters[0].(map[string]any)
	if page["operator"] != "includingRegex" || page["expression"] != PageRegex("/pricing") {
		t.Errorf("page filter = %v", page)
	}

	pages, err := c.Search(ctx, "sc-domain:example.com", Query{From: from, To: to, Dimension: "page"})
	if err != nil {
		t.Fatal(err)
	}
	if pages[0].Key != "/pricing" || pages[1].Key != "/" {
		t.Errorf("pages are shown as trckable's paths: %+v", pages)
	}
	if _, err := c.Search(ctx, "sc-domain:example.com", Query{Dimension: "country"}); err == nil {
		t.Error("an unknown dimension was sent to Google")
	}
}

func TestPageRegexMatchesThePageOnAnyScheme(t *testing.T) {
	re := regexp.MustCompile(PageRegex("/docs/a.b+c"))
	for _, u := range []string{"https://example.com/docs/a.b+c", "http://www.example.com/docs/a.b+c?x=1"} {
		if !re.MatchString(u) {
			t.Errorf("%s did not match", u)
		}
	}
	for _, u := range []string{"https://example.com/docs/aXb+c", "https://example.com/docs/a.b+c/more", "https://example.com/other/docs/a.b+c"} {
		if re.MatchString(u) {
			t.Errorf("%s matched", u)
		}
	}
}
