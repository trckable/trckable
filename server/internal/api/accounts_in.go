package api

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// One person can belong to several accounts (store/sqlite/memberships.go).
// The account a tab works in comes with each request (accountHeader) and is
// checked against the memberships every time; these routes are the person's
// own side of that: which accounts they are in, which one they used last,
// and leaving one.

// fewSites is how many of an account's sites the switcher lists before
// "N more".
const fewSites = 5

type accountSite struct {
	ID     string `json:"id"`
	Domain string `json:"domain"`
	Name   string `json:"name"`
}

type accountOut struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
	// Holder: the person is this account's first owner: leaving it is not offered.
	Holder bool          `json:"holder"`
	Sites  []accountSite `json:"sites"`
	Total  int           `json:"total"`
}

// accountsOf is every account the person is in, oldest first, with the sites
// they see in each.
func (a *API) accountsOf(r *http.Request, user string) ([]accountOut, error) {
	cards, err := a.Ctl.AccountCards(r.Context(), user, fewSites)
	if err != nil {
		return nil, err
	}
	out := make([]accountOut, 0, len(cards))
	for _, c := range cards {
		o := accountOut{ID: c.ID, Name: c.Name, Role: c.Role, Holder: c.Holder, Total: c.Total, Sites: []accountSite{}}
		for _, s := range c.Sites {
			o.Sites = append(o.Sites, accountSite{ID: s.ID, Domain: s.Domain, Name: s.Name})
		}
		out = append(out, o)
	}
	return out, nil
}

// useAccount remembers the account a person used last. The tab switches by
// itself (it sends the header); this only decides where a new tab opens.
func (a *API) useAccount(w http.ResponseWriter, r *http.Request) {
	p := principalOf(r)
	if p.user == nil {
		fail(w, http.StatusForbidden, "accounts belong to a person, not an API key")
		return
	}
	var in struct {
		Account string `json:"account"`
	}
	if err := decode(r, &in); err != nil || in.Account == "" {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	switch err := a.Ctl.SetLastAccount(r.Context(), p.user.ID, in.Account); {
	case errors.Is(err, sqlite.ErrNotMember):
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not in that account", "code": "not_member"})
	case err != nil:
		fail(w, http.StatusInternalServerError, err.Error())
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

// leaveAccount ends the person's own membership of one account. Their other
// accounts and their sessions stay; the last one takes the person with it.
func (a *API) leaveAccount(w http.ResponseWriter, r *http.Request) {
	p := principalOf(r)
	if p.user == nil {
		fail(w, http.StatusForbidden, "accounts belong to a person, not an API key")
		return
	}
	var in struct {
		Account string `json:"account"`
	}
	if err := decode(r, &in); err != nil || in.Account == "" {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	err := a.Ctl.Leave(r.Context(), p.user.ID, in.Account)
	switch {
	case errors.Is(err, sqlite.ErrNotMember):
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not in that account", "code": "not_member"})
	case errors.Is(err, sqlite.ErrHolder):
		fail(w, http.StatusConflict, "you started this account: it stays with you")
	case errors.Is(err, sqlite.ErrLastOwner):
		fail(w, http.StatusConflict, sqlite.ErrLastOwner.Error())
	case err != nil:
		slog.Warn("leaving an account failed", "user", p.user.ID, "err", err)
		fail(w, http.StatusInternalServerError, err.Error())
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}
