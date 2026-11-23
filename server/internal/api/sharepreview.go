package api

import (
	"fmt"
	"html"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"

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

// linkCards are the pictures a link's address may ask for (?t=), and the sections of the shared dashboard each needs: a
// link that does not show all of them shows the overview instead. Revenue, sales, goals, AI and the places and tech
// lists are never drawn for a link; nor is a money milestone. No section: the headline numbers are enough. What
// changed names referrers, pages, countries and devices, so it needs every section.
var linkCards = map[string][]string{
	"overview": nil, "numbers": nil, "grid": nil, "bestday": nil, "milestone": nil,
	"changed":     sqlite.ShareSections,
	"leaderboard": {"pages"}, "toppage": {"pages"}, "sources": {"sources"}, "topsource": {"sources"}, "search": {"sources"},
}

// linkMilestoneSection is the section a milestone's kind belongs to: "" for the headline numbers; ok is false for a
// kind a link never carries (money, and AI visits).
func linkMilestoneSection(kind string) (section string, ok bool) {
	switch kind {
	case milestones.SearchClicks:
		return "sources", true
	case milestones.Countries:
		return "places", true
	case milestones.AIVisits:
		return "", false
	}
	return "", !milestones.Money(kind)
}

// linkPeriod is the period a link's card is drawn for: the one the link is fixed to (a year is drawn as a month, the
// longest a card has), else the one asked for among the two a reader may choose. All time is not offered.
func linkPeriod(sh sqlite.Share, asked string) string {
	switch {
	case sh.Period == "12mo":
		return "30d"
	case sh.Period != "":
		return sh.Period
	case asked == "30d":
		return "30d"
	}
	return "7d"
}

// allShown says whether the link shows every one of the sections.
func allShown(sh sqlite.Share, sections []string) bool {
	return !slices.ContainsFunc(sections, func(s string) bool { return !sh.Shows(s) })
}

// linkCardQuery is the card a link's address asks for, as the card endpoint reads it: only the picture's own choices
// (which picture, period, size and look), each checked, and never a metric, stat or revenue. Anything else is left
// out, so an address cannot ask a link for more than the link shows.
func linkCardQuery(sh sqlite.Share, in url.Values) url.Values {
	q := url.Values{"t": {"overview"}, "period": {"7d"}, "shape": {"link"}, "theme": {"dark"}, "stats": {"engaged"}}
	if need, ok := linkCards[in.Get("t")]; ok && allShown(sh, need) {
		q.Set("t", in.Get("t"))
	}
	q.Set("period", linkPeriod(sh, in.Get("period")))
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
		kind, _, named := strings.Cut(in.Get("ms"), "~")
		section, carried := linkMilestoneSection(kind)
		if named && carried && (section == "" || sh.Shows(section)) {
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
	want := sharePreviewQuery
	if len(r.URL.Query()) > 0 {
		want = linkCardQuery(sh, r.URL.Query()).Encode()
	}
	key := sh.ID + "|" + strings.Join(sh.Sections, ",") + "|" + sh.Period + "?" + want
	if png, ok := linkPNGs.get(key, a.Now()); ok {
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Cache-Control", "private, max-age=30")
		_, _ = w.Write(png) //nolint:gosec // a PNG the server drew, not markup
		return
	}
	ask := r.Clone(r.Context())
	ask.URL.RawQuery = want
	ask.SetPathValue("site", sh.SiteID)
	rec := &pngRecorder{ResponseWriter: w}
	a.shareCard(rec, ask)
	if rec.ok() {
		linkPNGs.put(key, rec.body, a.Now())
	}
}

// linkPNGs keeps the pictures drawn for links' addresses for a while, so the public picture cannot be made to draw
// without limit: the same address is drawn once in ten minutes, and the number kept is small.
var linkPNGs = &linkCache{m: map[string]linkPNG{}}

const (
	linkPNGTTL  = 10 * time.Minute
	linkPNGKept = 256
)

type linkPNG struct {
	body []byte
	at   time.Time
}

type linkCache struct {
	mu sync.Mutex
	m  map[string]linkPNG
}

func (c *linkCache) get(key string, now time.Time) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[key]
	if !ok || now.Sub(e.at) > linkPNGTTL {
		delete(c.m, key)
		return nil, false
	}
	return e.body, true
}

func (c *linkCache) put(key string, body []byte, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.m) >= linkPNGKept {
		for k, e := range c.m {
			if now.Sub(e.at) > linkPNGTTL {
				delete(c.m, k)
			}
		}
		if len(c.m) >= linkPNGKept {
			clear(c.m)
		}
	}
	c.m[key] = linkPNG{body: body, at: now}
}

// pngRecorder passes an answer on and keeps a copy of a good picture.
type pngRecorder struct {
	http.ResponseWriter
	status int
	body   []byte
}

func (p *pngRecorder) WriteHeader(code int) {
	p.status = code
	p.ResponseWriter.WriteHeader(code)
}

func (p *pngRecorder) Write(b []byte) (int, error) {
	p.body = append(p.body, b...)
	return p.ResponseWriter.Write(b)
}

func (p *pngRecorder) ok() bool {
	return (p.status == 0 || p.status == http.StatusOK) && p.Header().Get("Content-Type") == "image/png" && len(p.body) > 0
}
