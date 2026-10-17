package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Where a site is talked about (internal/server/mentions.go finds it):
//
//	GET /api/v1/sites/{site}/mentions?period=7d|30d|90d|1y
//	GET /api/v1/sites/{site}/mentions/keywords
//	PUT /api/v1/sites/{site}/mentions/keywords   {"keywords": ["…"]}
//
// A mention carries the visitors it brought (sessions that came from its host
// in the two days after it was posted) and the busiest hour.

const (
	mentionsDefault = 30 * 24 * time.Hour
	mentionsMax     = 200
	// drivingFor and drivingPeak decide "from Hacker News now": posted within
	// the last twelve hours and its busiest hour no older than three.
	drivingFor  = 12 * time.Hour
	drivingPeak = 3 * time.Hour
)

var mentionPeriods = map[string]time.Duration{
	"7d": 7 * 24 * time.Hour, "30d": mentionsDefault, "90d": 90 * 24 * time.Hour, "1y": 365 * 24 * time.Hour,
}

type mentionOut struct {
	sqlite.Mention
	Driving bool `json:"driving,omitempty"`
}

// words is what a site is searched for: its address, then the words
// a person added.
type mentionWords struct {
	Default []string `json:"default"`
	Added   []string `json:"added"`
	Max     int      `json:"max"`
}

func (a *API) mentionWords(r *http.Request, site string) (mentionWords, error) {
	row, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		return mentionWords{}, err
	}
	added, err := a.Ctl.MentionKeywords(r.Context(), site)
	if err != nil {
		return mentionWords{}, err
	}
	return mentionWords{Default: sqlite.JoinWords(sqlite.SiteRow{Domain: row.Domain, Name: row.Name}, nil), Added: added, Max: sqlite.MaxKeywords}, nil
}

// ifMentions answers 404 while Mentions is switched off.
func (a *API) ifMentions(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !a.MentionsOn {
			http.NotFound(w, r)
			return
		}
		h(w, r)
	}
}

func (a *API) mentions(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	span := mentionsDefault
	if p := r.URL.Query().Get("period"); p != "" {
		var ok bool
		if span, ok = mentionPeriods[p]; !ok {
			fail(w, http.StatusBadRequest, "period must be 7d, 30d, 90d or 1y")
			return
		}
	}
	words, err := a.mentionWords(r, site)
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	now := a.Now()
	list, err := a.Ctl.Mentions(r.Context(), site, now.Add(-span).Unix(), now.Add(time.Hour).Unix(), mentionsMax)
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the mentions")
		return
	}
	out := make([]mentionOut, 0, len(list))
	var driving *mentionOut
	for _, m := range list {
		o := mentionOut{Mention: m}
		o.Driving = m.Visitors > 0 && now.Sub(time.Unix(m.PostedAt, 0)) < drivingFor && m.PeakHour > 0 && now.Sub(time.Unix(m.PeakHour, 0)) < drivingPeak
		if o.Driving && (driving == nil || m.Visitors > driving.Visitors) {
			d := o
			driving = &d
		}
		out = append(out, o)
	}
	w.Header().Set("Cache-Control", "private, max-age=30")
	writeJSON(w, http.StatusOK, map[string]any{"mentions": out, "sources": a.MentionSources, "words": words, "driving": driving})
}

func (a *API) mentionKeywords(w http.ResponseWriter, r *http.Request) {
	words, err := a.mentionWords(r, r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	writeJSON(w, http.StatusOK, words)
}

func (a *API) setMentionKeywords(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	if !a.siteExists(w, r) {
		return
	}
	var in struct {
		Keywords []string `json:"keywords"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if err := a.Ctl.SetMentionKeywords(r.Context(), site, in.Keywords, a.Now().Unix()); err != nil {
		if errors.Is(err, sqlite.ErrKeywords) {
			fail(w, http.StatusBadRequest, "Use up to 10 words of 3 to 60 characters, without quotation marks.")
			return
		}
		fail(w, http.StatusInternalServerError, "could not save the words")
		return
	}
	a.mentionKeywords(w, r)
}
