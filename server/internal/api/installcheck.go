package api

import (
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
)

// Checking an install from the outside: this server loads the site's homepage
// the way a visitor's browser would and looks for the snippet in it. It is a
// read of a public page, through the same guard alerts use, so it cannot be
// pointed at this machine or its private network. Nothing is recorded.

type installCheck struct {
	URL    string `json:"url"`              // the page that was read, after redirects
	Status int    `json:"status,omitempty"` // its HTTP status
	// Found: "site" (this site's script), "other" (a trckable script for
	// another site id), or "none". Empty when the page could not be read.
	Found string `json:"found,omitempty"`
	Error string `json:"error,omitempty"`
}

// snippetIn says what the page carries: this site's script (its id is in the
// src, or in a bundled package's config), a trckable script for some other
// site, or nothing trckable at all.
func snippetIn(page, siteID string) string {
	switch {
	case siteID != "" && strings.Contains(page, siteID):
		return "site"
	case strings.Contains(page, "/js/tkb_") || strings.Contains(strings.ToLower(page), "trckable"):
		return "other"
	}
	return "none"
}

func (a *API) checkInstall(w http.ResponseWriter, r *http.Request) {
	si, err := a.Ctl.SiteInfo(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	home := "https://" + si.Domain + "/"
	out := installCheck{URL: home}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, home, nil)
	if err != nil {
		out.Error = "the address is not valid"
		writeJSON(w, http.StatusOK, out)
		return
	}
	req.Header.Set("User-Agent", "trckable (install check)")
	req.Header.Set("Accept", "text/html")
	res, err := alerts.SafeClient(8 * time.Second).Do(req)
	if err != nil {
		out.Error = si.Domain + " could not be reached over https"
		writeJSON(w, http.StatusOK, out)
		return
	}
	defer res.Body.Close()
	out.URL, out.Status = res.Request.URL.String(), res.StatusCode
	if res.StatusCode >= 400 {
		out.Error = res.Request.URL.Host + " answered " + http.StatusText(res.StatusCode)
		writeJSON(w, http.StatusOK, out)
		return
	}
	page, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	out.Found = snippetIn(string(page), si.ID)
	writeJSON(w, http.StatusOK, out)
}
