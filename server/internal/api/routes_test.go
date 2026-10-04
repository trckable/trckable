package api

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Who may call what, for every route there is. Each route Routes registered
// is tried as nobody, as a viewer of the site's account, as an owner of
// another account, with the account's API key, and
// as the owner without the CSRF header; the table says which of them get
// through. A route added later without a line here fails the test, so its
// rule is decided when it is written, not found in an audit.
//
// The rules:
//
//	public  no session needed; a cookie or key changes nothing
//	read    anyone of the account: owner, viewer, API key
//	self    a signed-in person's own account (viewer too), never a key
//	selfW   the same, a change: viewers may, keys may not
//	owner   read, but only an owner (settings that hold secrets or people)
//	write   a change: owners only (and the automation token)
var routeRules = map[string]string{
	"GET /api/v1/setup":                                          "public",
	"POST /api/v1/setup":                                         "public",
	"POST /api/v1/payments/start-over":                           "write",
	"POST /api/v1/login":                                         "public",
	"POST /api/v1/logout":                                        "public",
	"GET /api/v1/me":                                             "read",
	"PUT /api/v1/me/keys":                                        "selfW",
	"GET /api/v1/sites":                                          "read",
	"GET /api/v1/site-layout":                                    "read",
	"PUT /api/v1/site-layout":                                    "write",
	"GET /api/v1/overview":                                       "read",
	"POST /api/v1/sites":                                         "write",
	"GET /api/v1/sites/{site}":                                   "read",
	"PATCH /api/v1/sites/{site}":                                 "write",
	"GET /api/v1/sites/{site}/icon":                              "read",
	"PUT /api/v1/sites/{site}/icon":                              "write",
	"DELETE /api/v1/sites/{site}/icon":                           "write",
	"POST /api/v1/sites/{site}/icon/favicon":                     "write",
	"PUT /api/v1/sites/{site}/color":                             "write",
	"GET /api/v1/sites/{site}/widgets":                           "read",
	"POST /api/v1/sites/{site}/widgets":                          "write",
	"GET /api/v1/sites/{site}/widgets/preview":                   "read",
	"PUT /api/v1/sites/{site}/widgets/{id}":                      "write",
	"DELETE /api/v1/sites/{site}/widgets/{id}":                   "write",
	"GET /w/{id}":                                                "public",
	"POST /api/v1/sites/{site}/install/check":                    "write",
	"DELETE /api/v1/sites/{site}":                                "write",
	"GET /api/v1/sites/{site}/delete-preview":                    "read",
	"GET /api/v1/sites/{site}/milestones":                        "read",
	"PUT /api/v1/sites/{site}/milestones":                        "write",
	"POST /api/v1/sites/{site}/milestones/seen":                  "selfW",
	"GET /api/v1/sites/{site}/milestones/{kind}/{step}/card":     "read",
	"POST /api/v1/sites/{site}/milestones/{kind}/{step}/share":   "write",
	"DELETE /api/v1/sites/{site}/milestones/{kind}/{step}/share": "write",
	"GET /m/{token}":                                             "public",
	"GET /u/{token}":                                             "public",
	"POST /u/{token}":                                            "public",
	"GET /api/v1/sites/{site}/config":                            "read",
	"PUT /api/v1/sites/{site}/config":                            "write",
	"POST /api/v1/account/password":                              "selfW",
	"GET /api/v1/account":                                        "self",
	"PATCH /api/v1/account":                                      "selfW",
	"GET /api/v1/account/avatar":                                 "self",
	"PUT /api/v1/account/avatar":                                 "selfW",
	"DELETE /api/v1/account/avatar":                              "selfW",
	"GET /api/v1/account/2fa":                                    "self",
	"POST /api/v1/account/2fa/start":                             "selfW",
	"POST /api/v1/account/2fa/enable":                            "selfW",
	"POST /api/v1/account/2fa/disable":                           "selfW",
	"GET /api/v1/people":                                         "owner",
	"GET /api/v1/people/{id}/avatar":                             "self",
	"GET /api/v1/site-access":                                    "owner",
	"PUT /api/v1/site-access/{subject}":                          "write",
	"POST /api/v1/people":                                        "write",
	"PATCH /api/v1/people/{id}":                                  "write",
	"DELETE /api/v1/people/{id}":                                 "write",
	"POST /api/v1/people/{id}/password":                          "write",
	"POST /api/v1/people/{id}/two-step/off":                      "write",
	"GET /api/v1/sites/{site}/privacy/person":                    "owner",
	"GET /api/v1/sites/{site}/privacy/export":                    "owner",
	"DELETE /api/v1/sites/{site}/privacy/person":                 "write",
	"GET /api/v1/sites/{site}/shares":                            "owner",
	"POST /api/v1/sites/{site}/shares":                           "write",
	"DELETE /api/v1/sites/{site}/shares/{id}":                    "write",
	"PATCH /api/v1/sites/{site}/shares/{id}":                     "write",
	"POST /api/v1/sites/{site}/shares/{id}/address":              "write",
	"POST /api/v1/share/open":                                    "public",
	"GET /api/v1/share/me":                                       "public",
	"GET /api/v1/share/report":                                   "public",
	"GET /api/v1/share/annotations":                              "public",
	"GET /api/v1/share/icon":                                     "public",
	"GET /api/v1/share/logo":                                     "public",
	"GET /api/v1/share-domain/ask":                               "public",
	"GET /api/v1/sites/{site}/share-look":                        "owner",
	"PUT /api/v1/sites/{site}/share-look":                        "write",
	"POST /api/v1/sites/{site}/share-look/verify":                "write",
	"GET /api/v1/sites/{site}/share-logo":                        "owner",
	"PUT /api/v1/sites/{site}/share-logo":                        "write",
	"DELETE /api/v1/sites/{site}/share-logo":                     "write",
	"GET /api/v1/sites/{site}/report":                            "read",
	"GET /api/v1/sites/{site}/card":                              "read",
	"GET /api/v1/sites/{site}/moments":                           "read",
	"GET /api/v1/sites/{site}/insights":                          "read",
	"GET /api/v1/sites/{site}/markers":                           "read",
	"GET /api/v1/sites/{site}/sparks":                            "read",
	"GET /api/v1/sites/{site}/usual":                             "read",
	"GET /api/v1/referrer-icons":                                 "self",
	"GET /api/v1/referrer-icons/{host}":                          "self",
	"GET /api/v1/sites/{site}/buyers":                            "read",
	"GET /api/v1/sites/{site}/export.csv":                        "read",
	"GET /api/v1/sites/{site}/events":                            "read",
	"GET /api/v1/sites/{site}/live":                              "read",
	"GET /api/v1/sites/{site}/now":                               "read",
	"GET /api/v1/health":                                         "read",
	"GET /api/v1/keys":                                           "owner",
	"POST /api/v1/keys":                                          "write",
	"DELETE /api/v1/keys/{id}":                                   "write",
	"GET /api/v1/sites/{site}/modules":                           "read",
	"PUT /api/v1/sites/{site}/modules/{module}":                  "write",
	"GET /api/v1/sites/{site}/report/heatmap":                    "read",
	"GET /api/v1/sites/{site}/report/charts":                     "read",
	"GET /api/v1/sites/{site}/report/pages-sell":                 "read",
	"GET /api/v1/sites/{site}/report/crawlers":                   "read",
	"GET /api/v1/sites/{site}/report/ai-search":                  "read",
	"GET /api/v1/sites/{site}/report/ai-seen":                    "read",
	"GET /api/v1/sites/{site}/report/vitals":                     "read",
	"GET /api/v1/sites/{site}/report/retention":                  "read",
	"GET /api/v1/sites/{site}/report/scroll":                     "read",
	"GET /api/v1/sites/{site}/search-console":                    "read",
	"PUT /api/v1/sites/{site}/search-console":                    "write",
	"DELETE /api/v1/sites/{site}/search-console":                 "write",
	"GET /api/v1/sites/{site}/search-console/properties":         "owner",
	"GET /api/v1/sites/{site}/report/search":                     "read",
	"GET /api/v1/sites/{site}/alerts":                            "self",
	"PUT /api/v1/sites/{site}/alerts":                            "write",
	"POST /api/v1/sites/{site}/alerts/test":                      "write",
	"POST /api/v1/sites/{site}/alerts/weekly/send":               "write",
	"DELETE /api/v1/sites/{site}/alerts/{id}":                    "write",
	"GET /api/v1/sites/{site}/segments":                          "read",
	"POST /api/v1/sites/{site}/segments":                         "write",
	"PATCH /api/v1/sites/{site}/segments/{id}":                   "write",
	"DELETE /api/v1/sites/{site}/segments/{id}":                  "write",
	"GET /api/v1/sites/{site}/annotations":                       "read",
	"POST /api/v1/sites/{site}/annotations":                      "write",
	"PATCH /api/v1/sites/{site}/annotations/{id}":                "write",
	"DELETE /api/v1/sites/{site}/annotations/{id}":               "write",
	"GET /api/v1/sites/{site}/report/funnel":                     "read",
	"GET /api/v1/sites/{site}/report/goal-props":                 "read",
	"GET /api/v1/sites/{site}/journey/{visitor}":                 "read",
	"GET /api/v1/sites/{site}/payments":                          "read",
	"POST /api/v1/sites/{site}/payments":                         "write",
	"DELETE /api/v1/sites/{site}/payments/{id}":                  "write",
	"PATCH /api/v1/sites/{site}/payments/{id}":                   "write",
	"POST /api/v1/sites/{site}/payments/{id}/sync":               "write",
	"GET /api/v1/sites/{site}/payments/{id}/secret":              "owner",
	"POST /api/v1/sites/{site}/payments/reprocess":               "write",
}

// refusals are the answers a guard gives. A handler that got past every
// guard may still say no to the request itself (a wrong password, an id that
// is not there), and that is not a refusal of the caller.
var refusals = []string{
	"please sign in", "invalid API key", "API keys are read-only", "missing X-Trckable-Request header",
	"your account can read this instance, not change it", "only an owner", "only a signed-in",
	"an API key reads reports only", "API keys have no profile", "shortcuts belong to a person",
	"unauthorized", "site not found",
}

func refused(code int, body string) bool {
	if code == http.StatusUnauthorized {
		return true
	}
	for _, r := range refusals {
		if strings.Contains(body, r) {
			return true
		}
	}
	return false
}

func TestEveryRouteChecksWhoIsAsking(t *testing.T) {
	g := newRig(t)
	ctx := context.Background()
	owner := client()
	g.setup(t, owner)

	if _, err := g.ctl.AddUser(ctx, sqlite.DefaultAccount, "viewer@site.com", "correct horse battery V", sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	viewer := client()
	if code, out := do(t, viewer, "POST", g.srv.URL+"/api/v1/login", `{"email":"viewer@site.com","password":"correct horse battery V"}`); code != http.StatusOK {
		t.Fatalf("viewer signs in: %d %v", code, out)
	}
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
	key, _, err := g.ctl.CreateAPIKey(ctx, sqlite.DefaultAccount, "route table")
	if err != nil {
		t.Fatal(err)
	}

	// Secrets a viewer or a key must never read back, whatever route they try:
	// the key itself, a payment connection's signing secrets, a share link's
	// token and where an alert goes.
	secrets := seedSecrets(t, g, owner, key)

	type caller struct {
		name   string
		c      *http.Client
		bearer string
		header bool // sends X-Trckable-Request
	}
	anon := caller{"nobody", client(), "", true}
	asViewer := caller{"a viewer", viewer, "", true}
	asOther := caller{"another account's owner", other, "", true}
	asKey := caller{"an API key", client(), key, true}
	noCSRF := caller{"the owner without the CSRF header", owner, "", false}

	send := func(who caller, method, path string) (int, string) {
		t.Helper()
		var body io.Reader
		if method != "GET" && method != "HEAD" {
			body = strings.NewReader(`{"role":"viewer"}`)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		req, _ := http.NewRequestWithContext(ctx, method, g.srv.URL+path, body)
		req.Header.Set("Content-Type", "application/json")
		if who.header {
			req.Header.Set(csrf, "1")
		}
		if who.bearer != "" {
			req.Header.Set("Authorization", "Bearer "+who.bearer)
		}
		res, err := who.c.Do(req)
		if err != nil {
			t.Fatalf("%s %s as %s: %v", method, path, who.name, err)
		}
		defer res.Body.Close()
		if strings.HasPrefix(res.Header.Get("Content-Type"), "text/event-stream") {
			return res.StatusCode, "" // a live stream: the status is the answer
		}
		raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		return res.StatusCode, string(raw)
	}

	fill := strings.NewReplacer("{site}", g.site, "{id}", "x", "{module}", "goals", "{visitor}", "1")
	seen := map[string]bool{}
	for _, pattern := range g.api.patterns {
		seen[pattern] = true
		rule, ok := routeRules[pattern]
		if !ok {
			t.Errorf("%s has no rule in routeRules: decide who may call it", pattern)
			continue
		}
		method, raw, _ := strings.Cut(pattern, " ")
		path := fill.Replace(raw)
		siteRoute := strings.Contains(raw, "{site}")
		// Limits (sign-in, codes, checks) count per address and minute:
		// every route starts with a clean slate.
		g.advance(11 * time.Minute)

		expectRefused := func(who caller, codes ...int) {
			t.Helper()
			code, body := send(who, method, path)
			for _, c := range codes {
				if code == c {
					return
				}
			}
			t.Errorf("%s %s as %s: %d %s, want one of %v", method, path, who.name, code, strings.TrimSpace(body), codes)
		}
		expectAllowed := func(who caller) {
			t.Helper()
			code, body := send(who, method, path)
			if refused(code, body) || code >= 500 && code != http.StatusServiceUnavailable {
				t.Errorf("%s %s as %s: %d %s, want it let through", method, path, who.name, code, strings.TrimSpace(body))
			}
			for name, s := range secrets {
				if strings.Contains(body, s) {
					t.Errorf("%s %s as %s: the answer carries %s", method, path, who.name, name)
				}
			}
		}
		// unchanged runs refused calls and proves they left the database as
		// it was: a 403 that wrote first and refused after is still a hole.
		unchanged := func(calls func()) {
			t.Helper()
			before := fingerprint(t, g.ctl.DB)
			calls()
			if after := fingerprint(t, g.ctl.DB); after != before {
				t.Errorf("%s %s: a refused call changed the database", method, path)
			}
		}

		switch rule {
		case "public":
			// Nothing to take: anonymous gets the same as everyone else,
			// and no route here answers with anyone's data by accident.
			for _, who := range []caller{anon, asViewer, asOther, asKey} {
				if pattern == "POST /api/v1/logout" && who.bearer == "" && who.name != anon.name {
					continue // it would end the session the rest of the table needs
				}
				if code, body := send(who, method, path); code >= 500 {
					t.Errorf("%s %s as %s: %d %s", method, path, who.name, code, body)
				}
			}
		default:
			expectRefused(anon, http.StatusUnauthorized)
			if siteRoute {
				expectRefused(asOther, http.StatusNotFound)
			}
			if method != "GET" {
				expectRefused(noCSRF, http.StatusForbidden)
			}
			switch rule {
			case "read":
				expectAllowed(asViewer)
				expectAllowed(asKey)
			case "self":
				expectAllowed(asViewer)
				expectRefused(asKey, http.StatusForbidden, http.StatusNotFound)
			case "selfW":
				expectAllowed(asViewer)
				unchanged(func() { expectRefused(asKey, http.StatusForbidden, http.StatusNotFound) })
			case "owner", "write":
				unchanged(func() {
					expectRefused(asViewer, http.StatusForbidden)
					expectRefused(asKey, http.StatusForbidden)
				})
			default:
				t.Errorf("%s: unknown rule %q", pattern, rule)
			}
		}
	}
	for pattern := range routeRules {
		if !seen[pattern] {
			t.Errorf("routeRules lists %s, which is not a route any more", pattern)
		}
	}
	if len(seen) < 100 {
		t.Fatalf("only %d routes were tried: the route list is not being recorded", len(seen))
	}
}
