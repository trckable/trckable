package api

import (
	"net/http"
	"time"
	"unicode/utf8"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// What people write in the dashboard's Feedback box: kept for the owners of
// the instance to read.

const feedbackPerDay = 20

func (a *API) sendFeedback(w http.ResponseWriter, r *http.Request) {
	p := principalOf(r)
	if p.user == nil {
		fail(w, http.StatusForbidden, "only a signed-in person can send feedback")
		return
	}
	var in struct{ Message, Site, Path string }
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if utf8.RuneCountInString(in.Message) > sqlite.MaxFeedback {
		fail(w, http.StatusBadRequest, "please keep it under 2000 characters")
		return
	}
	if !a.loginRate.allow("feedback:"+p.user.ID, a.Now(), feedbackPerDay, 24*time.Hour) {
		fail(w, http.StatusTooManyRequests, "that is a lot of notes today; please try again tomorrow")
		return
	}
	// The site is only kept when it is one of this account's.
	if owner, err := a.Ctl.SiteAccount(r.Context(), in.Site); err != nil || owner != p.account {
		in.Site = ""
	}
	if err := a.Ctl.AddFeedback(r.Context(), p.user.ID, in.Site, in.Path, a.Version, in.Message, a.Now()); err != nil {
		fail(w, http.StatusInternalServerError, "could not keep that")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// feedbackList is for the instance's owners only.
func (a *API) feedbackList(w http.ResponseWriter, r *http.Request) {
	p := principalOf(r)
	if !canUser(p.user, ActFeedbackRead) {
		fail(w, http.StatusForbidden, "only an owner reads feedback")
		return
	}
	list, err := a.Ctl.ListFeedback(r.Context(), 200)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"feedback": list})
}
