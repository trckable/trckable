package api

import (
	"net/http"
	"strings"
)

// setGoalQuiet is PUT /me/goal-quiet: whether this person wants to hear of a goal in the bell only on the days it
// stands out. The bell's list for them is built again at once.
func (a *API) setGoalQuiet(w http.ResponseWriter, r *http.Request) {
	p := principalOf(r)
	if p.user == nil {
		fail(w, http.StatusForbidden, "the bell belongs to a person, not an API key")
		return
	}
	var in struct {
		Site  string `json:"site"`
		Goal  string `json:"goal"`
		Quiet bool   `json:"quiet"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if in.Site == "" || in.Goal == "" {
		fail(w, http.StatusBadRequest, "name the site and the goal")
		return
	}
	all, err := a.Ctl.ListSites(r.Context(), p.account)
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the sites")
		return
	}
	mine := false
	for _, s := range visible(p, all) {
		mine = mine || s.ID == in.Site
	}
	if !mine {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	if err := a.Ctl.SetGoalQuiet(r.Context(), p.user.ID, in.Site, in.Goal, in.Quiet); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.bell.forget(p.user.ID)
	writeJSON(w, http.StatusOK, map[string]any{"site": in.Site, "goal": in.Goal, "quiet": in.Quiet})
}

// forget drops the lists kept for one person: their bell is built again on its next read.
func (c *bellCache) forget(user string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for k := range c.m {
		if strings.Contains(k, "|"+user+"|") {
			delete(c.m, k)
		}
	}
}
