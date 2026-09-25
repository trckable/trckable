package api

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Verifying an install from the outside: this server loads the site's homepage
// the way a visitor's browser would and looks for this site's id — in the page
// itself, then in every script the page loads (a bundled npm install or a tag
// manager keeps it there). Reads of public pages only, through the same guard
// alerts use, so it cannot be pointed at this machine or its private network.
// Nothing is recorded, and nothing is sent to the site but plain GETs.

type installCheck struct {
	URL    string `json:"url"`              // the page that was read, after redirects
	Status int    `json:"status,omitempty"` // its HTTP status
	// Found: "site" (this site's id), "other" (trckable, but another site id),
	// or "none". Empty when the page could not be read.
	Found string `json:"found,omitempty"`
	// Via is where the id was found: "page", or the URL of the script.
	Via string `json:"via,omitempty"`
	// Scripts is how many of the page's scripts were read.
	Scripts int    `json:"scripts"`
	Error   string `json:"error,omitempty"`
}

// checkClient is the guarded client checks use; tests swap it so they never
// reach the internet.
var checkClient = func() *http.Client { return alerts.SafeClient(8 * time.Second) }

const (
	maxScripts    = 20
	maxPageBytes  = 2 << 20
	checkDeadline = 15 * time.Second
)

// snippetIn says what a page or script carries: this site's id, a trckable
// script for some other site, or nothing trckable at all.
func snippetIn(page, siteID string) string {
	switch {
	case siteID != "" && strings.Contains(page, siteID):
		return "site"
	case strings.Contains(page, "/js/tkb_") || strings.Contains(strings.ToLower(page), "trckable"):
		return "other"
	}
	return "none"
}

var scriptSrc = regexp.MustCompile(`(?is)<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']`)

// scriptURLs lists the scripts a page loads, as absolute http(s) URLs: the
// site's own first (that is where a bundle lives), at most maxScripts.
func scriptURLs(page string, base *url.URL) []string {
	var own, other []string
	seen := map[string]bool{}
	for _, m := range scriptSrc.FindAllStringSubmatch(page, -1) {
		u, err := base.Parse(strings.TrimSpace(m[1]))
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") || seen[u.String()] {
			continue
		}
		seen[u.String()] = true
		if u.Host == base.Host {
			own = append(own, u.String())
		} else {
			other = append(other, u.String())
		}
	}
	all := append(own, other...)
	if len(all) > maxScripts {
		all = all[:maxScripts]
	}
	return all
}

func fetchText(ctx context.Context, client *http.Client, u string) (body string, final *url.URL, status int, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", nil, 0, err
	}
	req.Header.Set("User-Agent", "trckable (install check)")
	res, err := client.Do(req)
	if err != nil {
		return "", nil, 0, err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, maxPageBytes))
	return string(b), res.Request.URL, res.StatusCode, nil
}

func (a *API) checkInstall(w http.ResponseWriter, r *http.Request) {
	si, err := a.Ctl.SiteInfo(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	out := verifySite(r.Context(), si.ID, si.Domain)
	a.remember(r.Context(), si.ID, out)
	writeJSON(w, http.StatusOK, out)
}

// remember keeps a check's outcome, so the site picker and the dashboard can
// tell a working install from one that stopped.
func (a *API) remember(ctx context.Context, site string, c installCheck) {
	_ = a.Ctl.SetCheck(ctx, site, sqlite.SiteCheck{At: time.Now().Unix(), Found: c.Found, Via: c.Via, Error: c.Error})
}

// VerifyAll checks every site of the installation once, a few seconds apart,
// so a site whose snippet disappeared is noticed within a day even when
// nobody opens Verify. One plain GET per site (plus its scripts when the id
// is not in the page).
func (a *API) VerifyAll(ctx context.Context) {
	rows, err := a.Ctl.AllSites(ctx)
	if err != nil {
		return
	}
	for _, s := range rows {
		if ctx.Err() != nil {
			return
		}
		a.remember(ctx, s.ID, verifySite(ctx, s.ID, s.Domain))
		select {
		case <-ctx.Done():
			return
		case <-time.After(3 * time.Second):
		}
	}
}

// verifySite reads the homepage, then the scripts it loads, and says whether
// this site's id is there.
func verifySite(parent context.Context, siteID, domain string) installCheck {
	ctx, cancel := context.WithTimeout(parent, checkDeadline)
	defer cancel()
	client := checkClient()
	home := "https://" + domain + "/"
	out := installCheck{URL: home}

	page, final, status, err := fetchText(ctx, client, home)
	if err != nil {
		out.Error = domain + " could not be reached over https"
		return out
	}
	out.URL, out.Status = final.String(), status
	if status >= 400 {
		out.Error = final.Host + " answered " + http.StatusText(status)
		return out
	}
	out.Found = snippetIn(page, siteID)
	if out.Found == "site" {
		out.Via = "page"
		return out
	}

	// Not in the HTML: read the scripts it loads, a few at a time, and stop at
	// the first that carries this site's id.
	urls := scriptURLs(page, final)
	var (
		mu    sync.Mutex
		wg    sync.WaitGroup
		slots = make(chan struct{}, 4)
	)
	for _, u := range urls {
		wg.Add(1)
		go func(u string) {
			defer wg.Done()
			slots <- struct{}{}
			defer func() { <-slots }()
			mu.Lock()
			done := out.Found == "site"
			mu.Unlock()
			if done || ctx.Err() != nil {
				return
			}
			body, _, st, err := fetchText(ctx, client, u)
			if err != nil || st >= 400 {
				return
			}
			mu.Lock()
			defer mu.Unlock()
			out.Scripts++
			switch snippetIn(body, siteID) {
			case "site":
				if out.Found != "site" {
					out.Found, out.Via = "site", u
					cancel() // found: the rest need not be read
				}
			case "other":
				if out.Found == "none" {
					out.Found = "other"
				}
			}
		}(u)
	}
	wg.Wait()
	return out
}
