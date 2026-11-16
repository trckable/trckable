package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// previewShare makes the page a link would open, for its owner to look at
// while building it (the Share dialog and Settings draw it small). The answer
// is the address of that page on this server: a link of its own that lasts an
// hour, kept apart from the site's real links (sqlite/sharepreview.go), and
// framed by this origin only. Whoever may make a link may look at one.
func (a *API) previewShare(w http.ResponseWriter, r *http.Request) {
	u := a.owner(w, r)
	if u == nil || !a.siteExists(w, r) {
		return
	}
	a.init()
	// A page asked for after every pause in typing: many, but not without end.
	if !a.loginRate.allow("sharepreview:"+u.ID, a.Now(), 120, time.Minute) {
		fail(w, http.StatusTooManyRequests, "tried many times just now: try again in a moment")
		return
	}
	var in struct {
		Name     string   `json:"name"`
		Revenue  bool     `json:"revenue"`
		Notes    bool     `json:"notes"`
		Live     bool     `json:"live"`
		Sections []string `json:"sections"`
		Period   string   `json:"period"`
		Lock     bool     `json:"lock"` // the password page, not the numbers
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if err := checkShareName(in.Name); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	token, err := a.Ctl.PreviewShare(r.Context(), r.PathValue("site"), u.ID, sqlite.PreviewSpec{
		Name: in.Name, Revenue: in.Revenue, Notes: in.Notes, Live: in.Live, Sections: in.Sections, Period: in.Period, Lock: in.Lock,
	}, a.Now())
	if busy(w, err) {
		return
	}
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	// A path, not an address: the picture is drawn by this page, on this origin,
	// whatever domain the real link is given.
	writeJSON(w, http.StatusOK, map[string]any{"path": "/s/" + strings.TrimSpace(token)})
}
