package api

import (
	"context"
	"net/http"
	"time"

	"github.com/trckable/trckable/server/internal/revenue"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Verified sources: what stands behind a site's numbers, and whether it is
// working right now. A source is listed once it is set up, and counts (ok)
// only while it really delivers; one that stopped is listed as not ok, so
// every screen can drop its badge instead of claiming more than is true.
//
//	snippet   the site's snippet was found on the site by the last outside
//	          check, and a visit arrived in the last 24 hours
//	gsc       Search Console is connected to a property and its last call to
//	          Google worked, within the last 3 days
//	payments  a live connection to a provider (never "anything else", which
//	          is typed in by hand) whose last webhook, or last sync that
//	          worked, is within the last 30 days
//
//	GET /api/v1/sites/{site}/verified   {"sources": [{kind, provider?, ok, since, checked, detail}]}

const (
	verifiedVisit    = 24 * time.Hour
	verifiedCheck    = 3 * 24 * time.Hour // the outside check runs daily; this is a missed day or two
	verifiedSearch   = 3 * 24 * time.Hour
	verifiedPayments = 30 * 24 * time.Hour
)

type verifiedSource struct {
	Kind     string `json:"kind"`               // snippet, gsc, payments
	Provider string `json:"provider,omitempty"` // payments: stripe, paypal, paddle, lemonsqueezy…
	OK       bool   `json:"ok"`
	Since    int64  `json:"since"`   // unix seconds: when it was set up
	Checked  int64  `json:"checked"` // unix seconds: when it last worked, or was last looked at
	Detail   string `json:"detail"`  // one plain sentence, in English
}

type verified struct {
	Sources []verifiedSource `json:"sources"`
}

// verifiedIn is everything the rules read, so they run without a server.
type verifiedIn struct {
	Now       time.Time
	Created   int64
	LastEvent int64
	Check     *sqlite.SiteCheck
	Search    *sqlite.SearchConsole
	Pay       []revenue.Connection
}

func within(now time.Time, ts int64, d time.Duration) bool {
	return ts > 0 && now.Sub(time.Unix(ts, 0)) <= d
}

func verifiedSources(in verifiedIn) []verifiedSource {
	out := []verifiedSource{}
	if s, ok := snippetSource(in); ok {
		out = append(out, s)
	}
	if s, ok := searchSource(in); ok {
		out = append(out, s)
	}
	return append(out, paymentSources(in)...)
}

func snippetSource(in verifiedIn) (verifiedSource, bool) {
	c := in.Check
	if c == nil && in.LastEvent == 0 {
		return verifiedSource{}, false
	}
	s := verifiedSource{Kind: "snippet", Since: in.Created, Checked: in.LastEvent}
	found := c != nil && c.Found == "site" && c.Error == "" && within(in.Now, c.At, verifiedCheck)
	fresh := within(in.Now, in.LastEvent, verifiedVisit)
	if c != nil {
		s.Checked = max(s.Checked, c.At)
	}
	switch {
	case found && fresh:
		s.OK, s.Detail = true, "The snippet is on the site and visits are arriving"
	case found:
		s.Detail = "The snippet is on the site, but no visit arrived in the last day"
	case c != nil && c.Found == "site":
		s.Detail = "The snippet was found, but the site has not been checked lately"
	default:
		s.Detail = "The snippet was not found on the site"
	}
	return s, true
}

func searchSource(in verifiedIn) (verifiedSource, bool) {
	c := in.Search
	if c == nil || c.Property == "" {
		return verifiedSource{}, false
	}
	s := verifiedSource{Kind: "gsc", Since: c.Created, Checked: c.LastOK}
	switch {
	case c.LastError != "":
		s.Detail = "Google refused the last request"
	case within(in.Now, c.LastOK, verifiedSearch):
		s.OK, s.Detail = true, "Connected to Search Console and synced"
	default:
		s.Detail = "Search Console has not answered in the last 3 days"
	}
	return s, true
}

func paymentSources(in verifiedIn) []verifiedSource {
	out := []verifiedSource{}
	for _, c := range in.Pay {
		// Typed in by hand, or a test connection: not proof of real money.
		if c.Provider == "custom" || c.Mode == "test" {
			continue
		}
		var hook, sync int64
		if c.LastEvent != nil {
			hook = *c.LastEvent
		}
		if c.LastSync != nil && c.LastError == "" {
			sync = *c.LastSync
		}
		last := max(hook, sync)
		s := verifiedSource{Kind: "payments", Provider: c.Provider, Since: c.CreatedAt, Checked: last}
		if within(in.Now, last, verifiedPayments) {
			s.OK, s.Detail = true, "Revenue is read from the provider, not typed in"
		} else {
			s.Detail = "Nothing has arrived from the provider in the last 30 days"
		}
		out = append(out, s)
	}
	return out
}

// verifiedOf reads what the rules need for one site.
func (a *API) verifiedOf(ctx context.Context, si sqlite.SiteInfo, check *sqlite.SiteCheck) verified {
	in := verifiedIn{Now: a.Now(), Created: si.CreatedAt, LastEvent: si.LastEventAt, Check: check}
	if c, err := a.Ctl.SearchConsoleOf(ctx, si.ID); err == nil {
		in.Search = &c
	}
	if a.Revenue != nil {
		in.Pay, _ = a.Revenue.Connections(ctx, si.ID, "")
	}
	return verified{Sources: verifiedSources(in)}
}

func (a *API) verified(w http.ResponseWriter, r *http.Request) {
	si, err := a.Ctl.SiteInfo(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	var check *sqlite.SiteCheck
	if c, err := a.Ctl.CheckOf(r.Context(), si.ID); err == nil && c.At > 0 {
		check = &c
	}
	writeJSON(w, http.StatusOK, a.verifiedOf(r.Context(), si, check))
}

// sharedVerified is what a shared link may say: the sources behind what the
// link shows. Payments count only when the link shows money.
func (a *API) sharedVerified(ctx context.Context, si sqlite.SiteInfo, money bool) verified {
	var check *sqlite.SiteCheck
	if c, err := a.Ctl.CheckOf(ctx, si.ID); err == nil && c.At > 0 {
		check = &c
	}
	v := a.verifiedOf(ctx, si, check)
	if money {
		return v
	}
	kept := v.Sources[:0]
	for _, s := range v.Sources {
		if s.Kind != "payments" {
			kept = append(kept, s)
		}
	}
	v.Sources = kept
	return v
}
