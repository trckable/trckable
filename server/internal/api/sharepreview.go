package api

import (
	"fmt"
	"html"
	"net/http"
	"net/url"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// What a chat or social app shows for a shared link: a title, one line and the
// overview card. Only a link anyone with the address can open gets any of it:
// one that asks for a password, has expired or was revoked says nothing about
// the site, because its name is not public until the password is given.
// The words live here, in one place (the tab's own is in the dashboard).
const (
	previewTitle = "%s analytics"
	previewText  = "People, pages and sources for %s, live."
)

// sharePreviewQuery is the picture a link shows: the overview of the last
// seven days at the link preview's size. Totals and a chart, which is what the
// page itself opens with.
const sharePreviewQuery = "t=overview&period=7d&shape=link&theme=dark&stats=engaged"

// openLink is the link a token opens without a password, or false.
func (a *API) openLink(r *http.Request, token string) (sqlite.Share, bool) {
	sh, err := a.Ctl.OpenShare(r.Context(), token, "", a.Now())
	return sh, err == nil
}

// SharePreview is the title and the meta tags of /s/<token>'s page; "" for any
// other page and for a link that does not open without a password.
func (a *API) SharePreview(r *http.Request) (title, tags string) {
	token := shareToken(r.URL.Path)
	if token == "" || r.Method != http.MethodGet {
		return "", ""
	}
	sh, ok := a.openLink(r, token)
	if !ok {
		return "", ""
	}
	si, err := a.Ctl.SiteInfo(r.Context(), sh.SiteID)
	if err != nil {
		return "", ""
	}
	e := html.EscapeString
	page := a.shareBase(r, sh.SiteID) + "/s/" + url.PathEscape(token)
	head := e(fmt.Sprintf(previewTitle, si.Domain))
	desc := e(fmt.Sprintf(previewText, si.Domain))
	return head, `<meta name="description" content="` + desc + `">` +
		`<meta property="og:type" content="website">` +
		`<meta property="og:title" content="` + head + `">` +
		`<meta property="og:description" content="` + desc + `">` +
		`<meta property="og:url" content="` + e(page) + `">` +
		`<meta property="og:image" content="` + e(page+"/card.png") + `">` +
		`<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">` +
		`<meta name="twitter:card" content="summary_large_image">` +
		`<meta name="twitter:title" content="` + head + `">` +
		`<meta name="twitter:description" content="` + desc + `">` +
		`<meta name="twitter:image" content="` + e(page+"/card.png") + `">`
}

// SharePreviewImage is /s/<token>/card.png: the overview card of the link's
// site, drawn the way the Share dialog's picture is (so a site that hides
// trckable's name has none on it either). Anything but an open link is a 404.
func (a *API) SharePreviewImage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Robots-Tag", "noindex")
	sh, ok := a.openLink(r, r.PathValue("token"))
	if !ok {
		w.Header().Set("Cache-Control", "no-store")
		http.NotFound(w, r)
		return
	}
	ask := r.Clone(r.Context())
	ask.URL.RawQuery = sharePreviewQuery
	ask.SetPathValue("site", sh.SiteID)
	a.shareCard(w, ask)
}
