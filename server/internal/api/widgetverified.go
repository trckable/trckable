package api

import (
	"html/template"
	"net/http"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The verified badge: what stands behind this site's numbers, as a small
// card a site shows on its own pages. It lists only the sources that work
// right now (verified.go), draws nothing when there are none, and links to
// the site's public share link when the owner made one without a password or
// money in it, else to trckable.com.

type widgetMark struct {
	Name string
	Svg  template.HTML
}

// Our own constant SVGs, never input.
const (
	markSnippet template.HTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5.5 4.5-3 3.5 3 3.5M10.5 4.5l3 3.5-3 3.5"/></svg>`
	markGSC     template.HTML = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="#4285f4" d="M15.2 8.2c0-.5 0-.9-.1-1.3H8v2.5h4a3.5 3.5 0 0 1-1.5 2.3v1.9h2.4c1.4-1.3 2.3-3.2 2.3-5.4z"/><path fill="#34a853" d="M8 15.5c2 0 3.7-.7 4.9-1.8l-2.4-1.9c-.7.4-1.5.7-2.5.7a4.4 4.4 0 0 1-4.1-3H1.4v1.9A7.5 7.5 0 0 0 8 15.5z"/><path fill="#fbbc05" d="M3.9 9.5a4.5 4.5 0 0 1 0-3V4.6H1.4a7.5 7.5 0 0 0 0 6.8z"/><path fill="#ea4335" d="M8 3.5c1.1 0 2.1.4 2.9 1.1l2.1-2.1A7.5 7.5 0 0 0 1.4 4.6l2.5 1.9A4.5 4.5 0 0 1 8 3.5z"/></svg>`
	markPay     template.HTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.8" y="3.5" width="12.4" height="9" rx="2"/><path d="M1.8 6.6h12.4"/></svg>`
	markStripe  template.HTML = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect width="16" height="16" rx="4" fill="#635bff"/><path fill="#fff" d="M7.4 6.2c0-.4.3-.6.9-.6.8 0 1.7.3 2.4.7V4.2a6.3 6.3 0 0 0-2.4-.4c-2 0-3.3 1-3.3 2.7 0 2.7 3.7 2.2 3.7 3.4 0 .5-.4.6-1 .6-.9 0-1.9-.4-2.7-.8v2.2c.9.4 1.8.6 2.7.6 2 0 3.4-1 3.4-2.7 0-2.9-3.7-2.4-3.7-3.6z"/></svg>`
)

// widgetMarks are the icons of the sources that count, in order, with their
// names in the page's language.
func widgetMarks(v verified, words widgetWords) []widgetMark {
	var out []widgetMark
	paid := false
	for _, s := range v.Sources {
		if !s.OK {
			continue
		}
		switch s.Kind {
		case "snippet":
			out = append(out, widgetMark{words.plain("v_snippet"), markSnippet})
		case "gsc":
			out = append(out, widgetMark{words.plain("v_gsc"), markGSC})
		case "payments":
			if paid {
				continue // one mark for the money, whoever pays
			}
			paid = true
			svg := markPay
			if s.Provider == "stripe" {
				svg = markStripe
			}
			out = append(out, widgetMark{words.plain("v_pay"), svg})
		}
	}
	return out
}

// verifiedHref is where the badge leads: a public link to this site that
// shows no money and asks no password, else trckable.com.
func (a *API) verifiedHref(r *http.Request, si sqlite.SiteInfo) string {
	list, err := a.Ctl.Shares(r.Context(), si.ID)
	if err == nil {
		now := a.Now().Unix()
		for _, sh := range list {
			if sh.Token != "" && !sh.HasPass && !sh.Revenue && (sh.ExpiresAt == nil || *sh.ExpiresAt > now) {
				return a.shareBase(r, si.ID) + "/s/" + sh.Token
			}
		}
	}
	return "https://trckable.com/?ref=verified"
}

func (a *API) fillVerified(r *http.Request, d *widgetData, si sqlite.SiteInfo, words widgetWords, public bool) {
	var check *sqlite.SiteCheck
	if c, err := a.Ctl.CheckOf(r.Context(), si.ID); err == nil && c.At > 0 {
		check = &c
	}
	d.Marks = widgetMarks(a.verifiedOf(r.Context(), si, check), words)
	d.Href = "https://trckable.com/?ref=verified"
	if len(d.Marks) > 0 {
		d.Href = a.verifiedHref(r, si)
	}
	if len(d.Marks) == 0 && !public {
		d.Off = "Nothing is verified yet. Add the snippet, connect Search Console or a payment provider and the badge shows."
	}
}
