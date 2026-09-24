package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/trckable/trckable/server/internal/revenue"
)

// Data requests: someone asks what a site holds about them, or asks for it to
// go. Both are owner-only, both name the visitor first, and the answer about
// what an erasure does not remove is given plainly.

// findPerson resolves the visitor a request is about: a visitor id as the
// dashboard shows it, or the email address used at checkout.
func (a *API) findPerson(w http.ResponseWriter, r *http.Request) (uint64, bool) {
	v := r.URL.Query()
	if id := strings.TrimSpace(v.Get("visitor")); id != "" {
		n, err := strconv.ParseUint(id, 36, 64)
		if err != nil {
			fail(w, http.StatusBadRequest, "that is not a visitor id")
			return 0, false
		}
		return n, true
	}
	email := strings.TrimSpace(v.Get("email"))
	if email == "" {
		fail(w, http.StatusBadRequest, "give a visitor id or an email address")
		return 0, false
	}
	if a.Revenue == nil {
		fail(w, http.StatusBadRequest, "an email only finds someone through a payment, and payments are off")
		return 0, false
	}
	n, err := a.Revenue.VisitorForEmail(r.Context(), r.PathValue("site"), email)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return 0, false
	}
	if n == 0 {
		fail(w, http.StatusNotFound, "no payment on this site used that email address")
		return 0, false
	}
	return n, true
}

// person answers "what do you hold about me?" with counts, before anything is
// exported or erased.
func (a *API) person(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil {
		return
	}
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	if !a.siteExists(w, r) {
		return
	}
	visitor, ok := a.findPerson(w, r)
	if !ok {
		return
	}
	found, err := q.FindPerson(r.Context(), r.PathValue("site"), visitor)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	pay := []revenue.PersonPayment{}
	if a.Revenue != nil {
		pay, err = a.Revenue.PaymentsOf(r.Context(), r.PathValue("site"), visitor)
		if err != nil {
			fail(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"found": found, "payments": pay})
}

// exportPerson hands over everything, as a file they can keep.
func (a *API) exportPerson(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil {
		return
	}
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	site := r.PathValue("site")
	si, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	visitor, ok := a.findPerson(w, r)
	if !ok {
		return
	}
	out, err := q.ExportPerson(r.Context(), site, si.Domain, visitor, a.Now())
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	body := map[string]any{"export": out}
	if a.Revenue != nil {
		pay, err := a.Revenue.PaymentsOf(r.Context(), site, visitor)
		if err != nil {
			fail(w, http.StatusInternalServerError, err.Error())
			return
		}
		body["payments"] = pay
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="trckable-`+si.Domain+`-`+out.Visitor+`.json"`)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ") // a person may well read this file
	enc.Encode(body)
}

// erasePerson removes a visitor from the analytics store and cuts their
// payments loose. What it cannot remove is named in the answer.
func (a *API) erasePerson(w http.ResponseWriter, r *http.Request) {
	if a.owner(w, r) == nil {
		return
	}
	if !a.siteExists(w, r) {
		return
	}
	if a.ErasePerson == nil {
		fail(w, http.StatusServiceUnavailable, "the analytics store is still warming up — try again in a moment")
		return
	}
	visitor, ok := a.findPerson(w, r)
	if !ok {
		return
	}
	site := r.PathValue("site")
	events, sessions, err := a.ErasePerson(r.Context(), site, visitor)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	var unlinked int64
	if a.Revenue != nil {
		if unlinked, err = a.Revenue.UnlinkVisitor(r.Context(), site, visitor); err != nil {
			fail(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	a.cache.purgeSite(site)
	out := map[string]any{
		"visitor":  strconv.FormatUint(visitor, 36),
		"events":   events,
		"sessions": sessions,
		"payments": unlinked,
	}
	if unlinked > 0 {
		out["kept"] = "The payments themselves stay — they are business records — but nothing on them points at a person any more."
	}
	writeJSON(w, http.StatusOK, out)
}
