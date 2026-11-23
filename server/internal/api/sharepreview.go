package api

import (
	"fmt"
	"html"
	"net/http"
	"net/url"
	"slices"
	"strings"

	"github.com/trckable/trckable/server/internal/cards"
	"github.com/trckable/trckable/server/internal/milestones"
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

// sharePreviewQuery is the picture a link shows when its address asks for none: the overview of the last
// seven days at the link preview's size. Totals and a chart, which is what the
// page itself opens with.
const sharePreviewQuery = "t=overview&period=7d&shape=link&theme=dark&stats=engaged"

// linkCards are the pictures a link's address may ask for (?t=), and the section of the shared dashboard each needs: a
// link that does not show that section shows the overview instead. Revenue, sales, goals, AI and the places and tech
// lists are never drawn for a link; nor is a money milestone. "" needs nothing beyond the headline numbers.
var linkCards = map[string]string{
	"overview": "", "numbers": "", "grid": "", "changed": "", "milestone": "", "bestday": "",
	"leaderboard": "pages", "toppage": "pages", "sources": "sources", "topsource": "sources", "search": "sources",
}

// linkCardQuery is the card a link's address asks for, as the card endpoint reads it: only the picture's own choices
// (which picture, period, size and look), each checked, and never a metric, stat or revenue. Anything else is left
// out, so an address cannot ask a link for more than the link shows.
func linkCardQuery(sh sqlite.Share, in url.Values) url.Values {
	q := url.Values{"t": {"overview"}, "period": {"7d"}, "shape": {"link"}, "theme": {"dark"}, "stats": {"engaged"}}
	if need, ok := linkCards[in.Get("t")]; ok && (need == "" || sh.Shows(need)) {
		q.Set("t", in.Get("t"))
	}
	if slices.Contains([]string{"7d", "30d", "all"}, in.Get("period")) {
		q.Set("period", in.Get("period"))
	}
	if f := cards.FormatOf(in.Get("shape")); f.ID == in.Get("shape") {
		q.Set("shape", f.ID)
	}
	if in.Get("theme") == "light" {
		q.Set("theme", "light")
	}
	if a := in.Get("accent"); len(a) == 7 && a[0] == '#' && strings.Trim(a[1:], "0123456789abcdefABCDEF") == "" {
		q.Set("accent", a)
	}
	if slices.Contains(cards.Backgrounds, in.Get("bg")) {
		q.Set("bg", in.Get("bg"))
	}
	for _, k := range []string{"date", "name"} {
		if in.Get(k) == "0" {
			q.Set(k, "0")
		}
	}
	// A milestone card names its milestone, and never a money one: the biggest of a period might be revenue.
	if q.Get("t") == "milestone" {
		if kind, _, ok := strings.Cut(in.Get("ms"), "~"); ok && !milestones.Money(kind) {
			q.Set("ms", in.Get("ms"))
		} else {
			q.Set("t", "overview")
		}
	}
	if l := in.Get("lang"); cardLangs[l] != nil {
		q.Set("lang", l)
	}
	return q
}

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
	card := linkCardQuery(sh, r.URL.Query())
	size := cards.FormatOf(card.Get("shape"))
	image := page + "/card.png"
	if len(r.URL.Query()) > 0 {
		image += "?" + card.Encode()
	}
	head := e(fmt.Sprintf(previewTitle, si.Domain))
	desc := e(fmt.Sprintf(previewText, si.Domain))
	return head, `<meta name="description" content="` + desc + `">` +
		`<meta property="og:type" content="website">` +
		`<meta property="og:title" content="` + head + `">` +
		`<meta property="og:description" content="` + desc + `">` +
		`<meta property="og:url" content="` + e(page) + `">` +
		`<meta property="og:image" content="` + e(image) + `">` +
		fmt.Sprintf(`<meta property="og:image:width" content="%d"><meta property="og:image:height" content="%d">`, size.W, size.H) +
		`<meta name="twitter:card" content="summary_large_image">` +
		`<meta name="twitter:title" content="` + head + `">` +
		`<meta name="twitter:description" content="` + desc + `">` +
		`<meta name="twitter:image" content="` + e(image) + `">`
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
	if len(r.URL.Query()) > 0 {
		ask.URL.RawQuery = linkCardQuery(sh, r.URL.Query()).Encode()
	}
	ask.SetPathValue("site", sh.SiteID)
	a.shareCard(w, ask)
}
