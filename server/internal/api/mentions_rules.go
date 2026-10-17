package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/trckable/trckable/server/internal/mentions"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// What an owner can say about what counts as a mention of the site:
//
//	GET  /api/v1/sites/{site}/mentions/rules
//	PUT  /api/v1/sites/{site}/mentions/rules   {"topic": [], "required": [], "excluded": [], "blocked": []}
//	GET  /api/v1/sites/{site}/mentions/hidden
//	GET  /api/v1/sites/{site}/mentions/lookalike?word=albas
//	POST /api/v1/sites/{site}/mentions/{id}/not-about-us
//	POST /api/v1/sites/{site}/mentions/{id}/restore
//
// "Not about us" hides a mention and keeps it in the hidden list; the answer
// offers to exclude the words that set it apart or to block its source.

// suggestedName is the name in a site's address ("albas" in albas.al), unless
// it is already one of the added words or too short to mean anything.
func suggestedName(domain string, added []string) []string {
	name, _, _ := strings.Cut(strings.TrimPrefix(strings.ToLower(strings.TrimSpace(domain)), "www."), ".")
	out := []string{}
	if len([]rune(name)) < 3 {
		return out
	}
	for _, a := range added {
		if strings.EqualFold(a, name) {
			return out
		}
	}
	return append(out, name)
}

func (a *API) mentionRules(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	rules, err := a.Ctl.MentionRules(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the rules")
		return
	}
	writeJSON(w, http.StatusOK, rules)
}

func (a *API) setMentionRules(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	var in sqlite.MentionRules
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if err := a.Ctl.SetMentionRules(r.Context(), r.PathValue("site"), in); err != nil {
		if errors.Is(err, sqlite.ErrKeywords) {
			fail(w, http.StatusBadRequest, "Use up to 20 entries of 2 to 60 characters in each list, without quotation marks.")
			return
		}
		fail(w, http.StatusInternalServerError, "could not save the rules")
		return
	}
	a.mentionRules(w, r)
}

func (a *API) hiddenMentions(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	list, err := a.Ctl.HiddenMentions(r.Context(), r.PathValue("site"), mentionsMax)
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the hidden mentions")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"mentions": list})
}

// mentionLookAlike samples the news for a name word an owner is about to add.
func (a *API) mentionLookAlike(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	row, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	word := strings.Join(strings.Fields(r.URL.Query().Get("word")), " ")
	if n := len([]rune(word)); n < 3 || n > 60 || strings.ContainsAny(word, `"<>`) {
		fail(w, http.StatusBadRequest, "The word is 3 to 60 characters, without quotation marks.")
		return
	}
	none := mentions.LookAlike{Word: word, Examples: []string{}, Suggest: []string{}}
	if a.MentionGet == nil {
		writeJSON(w, http.StatusOK, none)
		return
	}
	now := a.Now()
	if res, ok := a.lookAlike.cached(site, word, now); ok {
		writeJSON(w, http.StatusOK, res)
		return
	}
	if !a.lookAlike.allow(site, now) {
		w.Header().Set("Retry-After", "3600")
		fail(w, http.StatusTooManyRequests, "Too many new words checked this hour. Try again later.")
		return
	}
	rules, err := a.Ctl.MentionRules(r.Context(), site)
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the rules")
		return
	}
	res, err := mentions.CheckLookAlike(r.Context(), a.MentionGet, word, row.Domain, rules.Topic)
	if err != nil {
		res = none // nothing is claimed when the news could not be read
	} else {
		a.lookAlike.keep(site, word, res, now)
	}
	w.Header().Set("Cache-Control", "private, max-age=300")
	writeJSON(w, http.StatusOK, res)
}

func mentionID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		fail(w, http.StatusNotFound, "mention not found")
		return 0, false
	}
	return id, true
}

// notAboutUs hides a mention and says what could keep the like of it out.
func (a *API) notAboutUs(w http.ResponseWriter, r *http.Request) {
	id, ok := mentionID(w, r)
	if !ok {
		return
	}
	site := r.PathValue("site")
	row, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	m, found, err := a.Ctl.MentionOf(r.Context(), site, id)
	if err != nil || !found {
		fail(w, http.StatusNotFound, "mention not found")
		return
	}
	if _, err := a.Ctl.SetMentionState(r.Context(), site, id, sqlite.MentionHidden); err != nil {
		fail(w, http.StatusInternalServerError, "could not hide the mention")
		return
	}
	names, _ := a.Ctl.MentionKeywords(r.Context(), site)
	rules, _ := a.Ctl.MentionRules(r.Context(), site)
	own := append(append([]string{row.Domain}, names...), rules.Topic...)
	block := ""
	if m.Source == mentions.News || m.Source == mentions.Ref {
		block = mentions.BlockedHost(m.Host)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"hidden":          true,
		"suggest_exclude": mentions.SuggestExclude([]string{m.Title}, own),
		"suggest_block":   block,
	})
}

func (a *API) restoreMention(w http.ResponseWriter, r *http.Request) {
	id, ok := mentionID(w, r)
	if !ok {
		return
	}
	found, err := a.Ctl.SetMentionState(r.Context(), r.PathValue("site"), id, sqlite.MentionShown)
	if err != nil || !found {
		fail(w, http.StatusNotFound, "mention not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"hidden": false})
}
