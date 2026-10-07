package api

import (
	"errors"
	"net/http"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/milestones"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Milestones: what a site reached (internal/milestones finds them each
// night), the one moment the dashboard shows, and the cards and links that
// share them. Money milestones follow the report's rule: shown only while
// the revenue module is on.
//
//	GET    /api/v1/sites/{site}/milestones               the list; ?next=1 adds the next steps
//	PUT    /api/v1/sites/{site}/milestones               {"enabled": bool}, the site's switch
//	POST   /api/v1/sites/{site}/milestones/seen          {"keys": [[kind, step]]}, for the person asking
//	GET    /api/v1/sites/{site}/milestones/{kind}/{step}/card   ?format=png|svg&theme=dark|light&amount=1
//	POST   /api/v1/sites/{site}/milestones/{kind}/{step}/share  {"amount": bool}: the link, shown once
//	DELETE /api/v1/sites/{site}/milestones/{kind}/{step}/share  revoke it

// visibleMilestones is the site's list as this request may see it.
func (a *API) visibleMilestones(r *http.Request, site string) ([]sqlite.Milestone, bool, error) {
	user := ""
	if u := principalOf(r).user; u != nil {
		user = u.ID
	}
	list, err := a.Ctl.Milestones(r.Context(), site, user)
	if err != nil {
		return nil, false, err
	}
	money := a.moduleOn(r, site, "revenue")
	out := list[:0]
	for _, m := range list {
		if milestones.Money(m.Kind) && !money {
			continue
		}
		out = append(out, m)
	}
	return out, money, nil
}

func (a *API) milestones(w http.ResponseWriter, r *http.Request) {
	si, err := a.Ctl.SiteInfo(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	on, err := a.Ctl.MilestonesOn(r.Context(), si.ID)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	list, money, err := a.visibleMilestones(r, si.ID)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	// One moment at most: the biggest of what is new to this person.
	var moment *sqlite.Milestone
	for i := range list {
		if list[i].New && (moment == nil || milestones.Bigger(list[i], *moment)) {
			moment = &list[i]
		}
	}
	out := map[string]any{"enabled": on, "milestones": list, "moment": moment}
	if !on {
		out["moment"] = nil
	}
	if r.URL.Query().Get("next") == "1" {
		out["next"] = a.nextSteps(r, si, money)
	}
	writeJSON(w, http.StatusOK, out)
}

// nextSteps is where each counted family stands. Numbers only; nothing while
// the analytics store warms up.
func (a *API) nextSteps(r *http.Request, si sqlite.SiteInfo, money bool) []milestones.Next {
	out := []milestones.Next{}
	if a.Query == nil || a.Query() == nil {
		return out
	}
	today, _, _ := milestones.Due(sqlite.MilestoneSite{Timezone: si.Timezone}, a.Now())
	days, err := milestones.History(r.Context(), *a.Query(), a.Ctl.DB, si.ID, si.Timezone, si.Currency, today)
	if err != nil {
		return out
	}
	for _, n := range milestones.NextSteps(days, si.Currency, today) {
		if milestones.Money(n.Kind) && !money {
			continue
		}
		out = append(out, n)
	}
	return out
}

func (a *API) setMilestonesOn(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil || !a.siteExists(w, r) {
		return
	}
	var in struct {
		Enabled bool `json:"enabled"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if err := a.Ctl.SetMilestonesOn(r.Context(), r.PathValue("site"), in.Enabled); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"enabled": in.Enabled})
}

// closeMilestones records that the person asking has seen these: closing
// the moment closes everything new, and the rest waits in the timeline.
// Viewers may: it is their own view, and changes nothing for anyone else.
func (a *API) closeMilestones(w http.ResponseWriter, r *http.Request) {
	u := principalOf(r).user
	if u == nil {
		fail(w, http.StatusForbidden, "milestones are closed by a person, not a key")
		return
	}
	var in struct {
		Keys [][2]string `json:"keys"`
	}
	if err := decode(r, &in); err != nil || len(in.Keys) > 200 {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if err := a.Ctl.CloseMilestones(r.Context(), r.PathValue("site"), u.ID, in.Keys); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// milestoneOf finds the milestone a card or share route names, as this
// request may see it.
func (a *API) milestoneOf(w http.ResponseWriter, r *http.Request) (sqlite.Milestone, bool) {
	list, _, err := a.visibleMilestones(r, r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return sqlite.Milestone{}, false
	}
	for _, m := range list {
		if m.Kind == r.PathValue("kind") && m.Step == r.PathValue("step") {
			return m, true
		}
	}
	fail(w, http.StatusNotFound, "milestone not found")
	return sqlite.Milestone{}, false
}

func (a *API) milestoneCard(w http.ResponseWriter, r *http.Request) {
	m, ok := a.milestoneOf(w, r)
	if !ok {
		return
	}
	si, err := a.Ctl.SiteInfo(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	list, _, _ := a.visibleMilestones(r, r.PathValue("site"))
	q := r.URL.Query()
	a.serveCard(w, m, milestones.Context(m, list), si.Domain, q.Get("theme"), q.Get("amount") == "1", q.Get("format") == "svg", "private, no-store")
}

// serveCard draws a card, from the cache when it was drawn before.
func (a *API) serveCard(w http.ResponseWriter, m sqlite.Milestone, context, domain, theme string, amount, svg bool, cache string) {
	c := milestones.Card(m, context, domain, theme, amount)
	if svg {
		b, err := c.SVG()
		if err != nil {
			fail(w, http.StatusInternalServerError, "the card could not be drawn")
			return
		}
		w.Header().Set("Content-Type", "image/svg+xml")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'")
		w.Header().Set("Cache-Control", cache)
		//nolint:gosec // an SVG built by package cards, every word escaped, served with a CSP that runs nothing
		_, _ = w.Write(b)
		return
	}
	b, err := pngCache.get(c.Key(), c.PNG)
	if err != nil {
		fail(w, http.StatusInternalServerError, "the card could not be drawn")
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", cache)
	_, _ = w.Write(b)
}

func (a *API) shareMilestone(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil {
		return
	}
	m, ok := a.milestoneOf(w, r)
	if !ok {
		return
	}
	var in struct {
		Amount bool `json:"amount"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	token, err := a.Ctl.ShareMilestone(r.Context(), r.PathValue("site"), m.Kind, m.Step, in.Amount && m.Kind == milestones.Revenue)
	if errors.Is(err, sqlite.ErrShared) {
		fail(w, http.StatusConflict, err.Error())
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"url": a.publicBase(r) + "/m/" + token})
}

func (a *API) revokeMilestoneShare(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil {
		return
	}
	err := a.Ctl.RevokeMilestoneShare(r.Context(), r.PathValue("site"), r.PathValue("kind"), r.PathValue("step"))
	if errors.Is(err, auth.ErrNotFound) {
		fail(w, http.StatusNotFound, "no link to revoke")
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
