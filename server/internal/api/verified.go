package api

import (
	"context"
	"net/http"
	"time"

	"github.com/trckable/trckable/server/internal/revenue"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Verified sources: what stands behind a site's numbers, and whether it is
// working right now. A source is an independent third party that vouches for
// the numbers; trckable's own snippet on the site is not one and is never
// listed. One entry per kind. A source is listed once it is set up, and counts
// (ok) only while it really delivers; one that stopped is listed as not ok, so
// every screen can drop its badge instead of claiming more than is true.
//
//	gsc       Search Console is connected to a property and its last call to
//	          Google worked, within the last 3 days
//	payments  a live connection to a provider (never "anything else", which
//	          is typed in by hand) whose last webhook, or last sync that
//	          worked, is within the last 30 days; any number of providers
//	          make this one entry, ok while one of them delivers
//
//	GET /api/v1/sites/{site}/verified   {"sources": [{kind, provider?, ok, since, checked, detail}]}

const (
	verifiedSearch   = 3 * 24 * time.Hour
	verifiedPayments = 30 * 24 * time.Hour
)

type verifiedSource struct {
	Kind     string `json:"kind"`               // gsc, payments
	Provider string `json:"provider,omitempty"` // payments: the provider that delivers (stripe, paypal, paddle…), for its mark
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
	Now    time.Time
	Search *sqlite.SearchConsole
	Pay    []revenue.Connection
}

func within(now time.Time, ts int64, d time.Duration) bool {
	return ts > 0 && now.Sub(time.Unix(ts, 0)) <= d
}

func verifiedSources(in verifiedIn) []verifiedSource {
	out := []verifiedSource{}
	if s, ok := searchSource(in); ok {
		out = append(out, s)
	}
	if s, ok := paymentSource(in); ok {
		out = append(out, s)
	}
	return out
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

// paymentSource is the one entry for the money: ok while any real connection
// delivers, naming the one that did last (its mark), whoever else is connected.
func paymentSource(in verifiedIn) (verifiedSource, bool) {
	var s verifiedSource
	var last int64
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
		got := max(hook, sync)
		if s.Kind == "" || s.Since == 0 || (c.CreatedAt > 0 && c.CreatedAt < s.Since) {
			s.Since = c.CreatedAt
		}
		if s.Kind == "" || got > last {
			s.Kind, s.Provider, last = "payments", c.Provider, got
		}
	}
	if s.Kind == "" {
		return s, false
	}
	s.Checked = last
	if within(in.Now, last, verifiedPayments) {
		s.OK, s.Detail = true, "Revenue is read from the provider, not typed in"
	} else {
		s.Detail = "Nothing has arrived from the provider in the last 30 days"
	}
	return s, true
}

// verifiedOf reads what the rules need for one site.
func (a *API) verifiedOf(ctx context.Context, si sqlite.SiteInfo) verified {
	in := verifiedIn{Now: a.Now()}
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
	writeJSON(w, http.StatusOK, a.verifiedOf(r.Context(), si))
}

// sharedVerified is what a shared link may say: only the sources that work
// now (a reader has no use for the owner's loose ends), and payments only when
// the link shows money.
func (a *API) sharedVerified(ctx context.Context, si sqlite.SiteInfo, money bool) verified {
	v := a.verifiedOf(ctx, si)
	kept := []verifiedSource{}
	for _, s := range v.Sources {
		if s.OK && (money || s.Kind != "payments") {
			kept = append(kept, s)
		}
	}
	return verified{Sources: kept}
}
