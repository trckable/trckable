package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/notice"
	"github.com/trckable/trckable/server/internal/permissions"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// domainState is what Settings shows about a site's domain: the address, the
// earlier addresses still accepted and until when, and whether the connected
// Search Console property still belongs to the domain.
type domainState struct {
	Domain  string              `json:"domain"`
	Former  []sqlite.FormerHost `json:"former"`
	Search  *domainSearch       `json:"search,omitempty"`
	Preview *domainPreview      `json:"preview,omitempty"`
	Days    int                 `json:"grace_days"`
}

type domainSearch struct {
	Property string `json:"property"`
	Matches  bool   `json:"matches"`
}

// domainPreview is what a change to another address would do, for the
// confirm step: the address as it would be kept.
type domainPreview struct {
	Domain string        `json:"domain"`
	Search *domainSearch `json:"search,omitempty"`
}

// propertyCovers says whether a Search Console property is the domain's: a
// whole-domain property covers its subdomains, an address property only itself
// (with or without www.).
func propertyCovers(property, domain string) bool {
	if rest, ok := strings.CutPrefix(property, "sc-domain:"); ok {
		rest = strings.ToLower(rest)
		return domain == rest || strings.HasSuffix(domain, "."+rest)
	}
	h := strings.ToLower(property)
	h = strings.TrimPrefix(strings.TrimPrefix(h, "https://"), "http://")
	h, _, _ = strings.Cut(h, "/")
	return strings.TrimPrefix(h, "www.") == domain
}

func (a *API) domainSearchOf(r *http.Request, site, domain string) *domainSearch {
	c, err := a.Ctl.SearchConsoleOf(r.Context(), site)
	if err != nil || c.Property == "" {
		return nil
	}
	return &domainSearch{Property: c.Property, Matches: propertyCovers(c.Property, domain)}
}

func (a *API) domainStateOf(r *http.Request, site string) (domainState, error) {
	si, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		return domainState{}, err
	}
	former, err := a.Ctl.FormerHostsOf(r.Context(), site, a.Now())
	if err != nil {
		return domainState{}, err
	}
	return domainState{Domain: si.Domain, Former: former, Search: a.domainSearchOf(r, site, si.Domain), Days: int(sqlite.FormerHostGrace / (24 * time.Hour))}, nil
}

func failDomain(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, auth.ErrNotFound):
		fail(w, http.StatusNotFound, "not found")
	case errors.Is(err, sqlite.ErrExists):
		fail(w, http.StatusConflict, "you already have that site")
	case errors.Is(err, sqlite.ErrSameDomain):
		fail(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, sqlite.ErrDomainTooSoon):
		writeJSON(w, http.StatusTooManyRequests, apiError{Error: err.Error(), Code: "domain_too_soon"})
	default:
		fail(w, http.StatusBadRequest, err.Error())
	}
}

// noSuchDomain is what a new address that is not in DNS is told.
const noSuchDomain = "This address doesn't exist yet. Check the spelling."

// validNewDomain is the address as it would be kept, or why it cannot be:
// the rules of adding a site, and not an address the account already has.
func (a *API) validNewDomain(r *http.Request, site, typed string) (string, error) {
	if host, ok := placeholderHost(typed); ok {
		return "", errors.New(placeholderMessage(host))
	}
	domain, err := sqlite.CleanDomain(typed)
	if err != nil {
		return "", err
	}
	si, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		return "", err
	}
	if domain == si.Domain {
		return "", sqlite.ErrSameDomain
	}
	if at, err := a.Ctl.DomainChangedAt(r.Context(), site); err != nil {
		return "", err
	} else if a.Now().Unix()-at < int64(sqlite.DomainChangeEvery/time.Second) {
		return "", sqlite.ErrDomainTooSoon
	}
	if taken, err := a.Ctl.AccountHasDomain(r.Context(), principalOf(r).account, domain, site); err != nil {
		return "", err
	} else if taken {
		return "", sqlite.ErrExists
	}
	if a.Resolve != nil && !a.Resolve(r.Context(), domain) {
		return "", errors.New(noSuchDomain)
	}
	return domain, nil
}

// recheckIfContradicted asks for a new look at a site our checks find down
// while its visitors keep arriving: one of the two is out of date.
func (a *API) recheckIfContradicted(site string, si sqlite.SiteInfo) {
	if si.DownVisitors && a.ProbeNow != nil {
		a.ProbeNow(site, false)
	}
}

// siteDomain answers Settings: the domain, the former addresses, the Search
// Console match. With ?to=<address> it also says what that change would be, or
// why it cannot be, for the confirm step.
func (a *API) siteDomain(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	st, err := a.domainStateOf(r, site)
	if err != nil {
		failDomain(w, err)
		return
	}
	if to := r.URL.Query().Get("to"); to != "" {
		// What a domain would do tells whether it is free in the account: only those who may change it ask.
		if !requireAct(w, r, permissions.ActChange, "only someone who can change this site's settings can check a new domain") {
			return
		}
		domain, err := a.validNewDomain(r, site, to)
		if err != nil {
			failDomain(w, err)
			return
		}
		st.Preview = &domainPreview{Domain: domain, Search: a.domainSearchOf(r, site, domain)}
	}
	writeJSON(w, http.StatusOK, st)
}

// changeDomain gives the site another address. The id, snippet and history
// stay; the old address is accepted for 30 more days.
func (a *API) changeDomain(w http.ResponseWriter, r *http.Request) {
	var in struct{ Domain string }
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	site := r.PathValue("site")
	domain, err := a.validNewDomain(r, site, in.Domain)
	if err != nil {
		failDomain(w, err)
		return
	}
	ch, err := a.Ctl.ChangeDomain(r.Context(), site, domain, authorOf(r), a.Now())
	if err != nil {
		failDomain(w, err)
		return
	}
	a.tellOwners(r, notice.DomainChanged, site, notice.Vars{"old": ch.Old, "domain": ch.New})
	a.cache.purgeSite(site)
	if a.ProbeNow != nil {
		a.ProbeNow(site, true) // the new address answers or not: say so now, not at the next round
	}
	st, err := a.domainStateOf(r, site)
	if err != nil {
		failDomain(w, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

// endFormerDomain stops accepting visits from an earlier address now.
func (a *API) endFormerDomain(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	if err := a.Ctl.EndFormerHost(r.Context(), site, r.PathValue("host")); err != nil {
		failDomain(w, err)
		return
	}
	a.cache.purgeSite(site)
	st, err := a.domainStateOf(r, site)
	if err != nil {
		failDomain(w, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}
