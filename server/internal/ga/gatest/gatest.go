// Package gatest is a stand-in for Google: the consent page, the token
// endpoint and the two Analytics APIs, so the import is tested end to end
// without the network.
package gatest

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/ga"
)

const (
	ClientID     = "ga-client-1.apps.googleusercontent.com"
	ClientSecret = "GOCSPX-client-secret-for-tests"
	// AccessToken is what the token endpoint hands out. Tests look for it in
	// logs and answers, where it must never be.
	AccessToken = "ya29.a0-FAKE-ACCESS-TOKEN-for-tests"
)

// Fake is one Google.
type Fake struct {
	srv *httptest.Server

	mu sync.Mutex
	// RedirectURI is the only one the OAuth client has registered.
	RedirectURI string
	// Authorized is the query of the last consent request.
	Authorized url.Values
	// Throttle is how many data requests answer 429 before one is served.
	Throttle int
	// Remaining is the tokens-per-hour the data API reports (0: not reported).
	Remaining int64
	// Denied makes the data API answer 401.
	Denied bool
	// DataFrom is the first day (YYYY-MM-DD) Google has any visits for.
	DataFrom string
	// Properties are the ids the Admin API lists.
	Properties []string
	// Requests counts data API calls; Tokens counts token exchanges.
	Requests, Tokens int
	// Codes are the authorization codes handed out and not yet used.
	codes map[string]string // code -> challenge
}

// New starts a fake Google.
func New(t *testing.T) *Fake {
	t.Helper()
	f := &Fake{DataFrom: "2020-10-14", Properties: []string{"properties/111", "properties/222"}, codes: map[string]string{}}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /auth", f.auth)
	mux.HandleFunc("POST /token", f.token)
	mux.HandleFunc("GET /admin/accountSummaries", f.admin)
	mux.HandleFunc("POST /data/", f.data)
	f.srv = httptest.NewServer(mux)
	t.Cleanup(f.srv.Close)
	return f
}

// Wire points a client at the fake, and makes it fast.
func (f *Fake) Wire(c *ga.Client) {
	c.AuthURL, c.TokenURL = f.srv.URL+"/auth", f.srv.URL+"/token"
	c.AdminURL, c.DataURL = f.srv.URL+"/admin", f.srv.URL+"/data"
	c.Pace = -1
	c.Sleep = func(ctx context.Context, _ time.Duration) error { return ctx.Err() }
	c.HTTP = f.srv.Client()
}

func (f *Fake) auth(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Authorized = q
	if q.Get("client_id") != ClientID || q.Get("redirect_uri") != f.RedirectURI || q.Get("response_type") != "code" ||
		q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "" || q.Get("state") == "" {
		http.Error(w, "redirect_uri_mismatch or a bad request", http.StatusBadRequest)
		return
	}
	code := "code-" + q.Get("state")
	f.codes[code] = q.Get("code_challenge")
	to, _ := url.Parse(q.Get("redirect_uri"))
	v := to.Query()
	v.Set("code", code)
	v.Set("state", q.Get("state"))
	to.RawQuery = v.Encode()
	http.Redirect(w, r, to.String(), http.StatusFound)
}

func (f *Fake) token(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Tokens++
	challenge, ok := f.codes[r.Form.Get("code")]
	delete(f.codes, r.Form.Get("code"))
	sum := sha256.Sum256([]byte(r.Form.Get("code_verifier")))
	user, pass, basic := r.BasicAuth()
	secretOK := r.Form.Get("client_secret") == ClientSecret || basic && url.QueryEscape(user) == ClientID && pass == ClientSecret
	if !ok || base64.RawURLEncoding.EncodeToString(sum[:]) != challenge || !secretOK || r.Form.Get("redirect_uri") != f.RedirectURI {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"access_token": AccessToken, "expires_in": 3600, "token_type": "Bearer", "scope": ga.Scope})
}

func bearer(r *http.Request) bool { return r.Header.Get("Authorization") == "Bearer "+AccessToken }

func (f *Fake) admin(w http.ResponseWriter, r *http.Request) {
	if !bearer(r) {
		http.Error(w, "{}", http.StatusUnauthorized)
		return
	}
	var ps []map[string]string
	for _, id := range f.Properties {
		ps = append(ps, map[string]string{"property": id, "displayName": "Site " + strings.TrimPrefix(id, "properties/")})
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"accountSummaries": []any{map[string]any{"displayName": "Account", "propertySummaries": ps}}})
}

type metricsRow struct {
	DimensionValues []map[string]string `json:"dimensionValues"`
	MetricValues    []map[string]string `json:"metricValues"`
}

func (f *Fake) data(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Requests++
	if !bearer(r) || f.Denied {
		http.Error(w, "{}", http.StatusUnauthorized)
		return
	}
	if f.Throttle > 0 {
		f.Throttle--
		http.Error(w, `{"error":{"status":"RESOURCE_EXHAUSTED"}}`, http.StatusTooManyRequests)
		return
	}
	var in struct {
		DateRanges []struct{ StartDate, EndDate string }
		Dimensions []struct{ Name string }
		Limit      int
		Offset     int
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || len(in.DateRanges) != 1 {
		http.Error(w, "{}", http.StatusBadRequest)
		return
	}
	from, _ := time.Parse("2006-01-02", in.DateRanges[0].StartDate)
	to, _ := time.Parse("2006-01-02", in.DateRanges[0].EndDate)
	first, _ := time.Parse("2006-01-02", f.DataFrom)
	var all []metricsRow
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		if d.Before(first) {
			continue
		}
		day := d.Format("20060102")
		n := 10 + d.Day() // sessions that day
		if len(in.Dimensions) == 1 {
			all = append(all, row([]string{day}, n, n-2, n*3))
			continue
		}
		for _, v := range values(in.Dimensions[1].Name) {
			all = append(all, row([]string{day, v.value}, v.share*n/10, v.share*(n-2)/10, v.share*n*3/10))
		}
	}
	end := in.Offset + in.Limit
	if end > len(all) {
		end = len(all)
	}
	page := []metricsRow{}
	if in.Offset < len(all) {
		page = all[in.Offset:end]
	}
	out := map[string]any{"rows": page, "rowCount": len(all)}
	if f.Remaining > 0 {
		out["propertyQuota"] = map[string]any{"tokensPerHour": map[string]any{"consumed": 5, "remaining": f.Remaining}}
	}
	_ = json.NewEncoder(w).Encode(out)
}

func row(dims []string, a, b, c int) metricsRow {
	var m metricsRow
	for _, d := range dims {
		m.DimensionValues = append(m.DimensionValues, map[string]string{"value": d})
	}
	for _, v := range []int{a, b, c} {
		m.MetricValues = append(m.MetricValues, map[string]string{"value": itoa(v)})
	}
	return m
}

func itoa(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}

type val struct {
	value string
	share int
}

func values(dim string) []val {
	switch dim {
	case "sessionSource":
		return []val{{"google", 6}, {"(direct)", 3}, {"(not set)", 1}}
	case "sessionMedium":
		return []val{{"organic", 6}, {"(none)", 4}}
	case "pagePath":
		return []val{{"/pricing?email=ada@example.com", 5}, {"/pricing?utm=x", 2}, {"/", 3}}
	case "countryId":
		return []val{{"DE", 7}, {"AL", 3}}
	case "deviceCategory":
		return []val{{"desktop", 6}, {"mobile", 4}}
	}
	return nil
}
