package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/trckable/trckable/server/internal/modules"
	"github.com/trckable/trckable/server/internal/web"
)

// modulesOf is the site's module set, with a tiny cache so every report and
// every script request doesn't hit SQLite.
func (a *API) modulesOf(r *http.Request, site string) modules.Set {
	// Of always returns the defaults, even when the read fails: a database
	// hiccup must never silently switch a site's features off.
	set, _ := modules.Store{DB: a.Ctl.DB}.Of(r.Context(), site)
	return set
}

// needs answers 404 when a module is off, so a disabled feature costs a
// lookup and nothing else.
func (a *API) needs(w http.ResponseWriter, r *http.Request, id string) bool {
	if a.modulesOf(r, r.PathValue("site")).Has(id) {
		return true
	}
	fail(w, http.StatusNotFound, "the "+id+" module is off for this site")
	return false
}

func (a *API) listModules(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	if !a.siteExists(w, r) {
		return
	}
	set := a.modulesOf(r, site)
	type row struct {
		modules.Module
		Enabled bool `json:"enabled"`
	}
	sizes := web.TrackerSizes()
	out := make([]row, 0, len(modules.All))
	// Every figure in a module's text comes from the tracker build's own
	// measurements: {bytes} is the module's feature, {consent} and {banner}
	// the two ways of asking. Nothing is typed by hand.
	fill := strings.NewReplacer(
		"{consent}", fmtBytes(sizes.Feature[modules.TrackConsent]),
		"{banner}", fmtBytes(sizes.Feature[modules.TrackBanner]),
	)
	for _, m := range modules.All {
		m.TrackerBytes = sizes.Feature[m.Tracker] // measured by the tracker build
		costs := make([]string, len(m.Costs))
		for i, c := range m.Costs {
			costs[i] = strings.ReplaceAll(fill.Replace(c), "{bytes}", fmtBytes(m.TrackerBytes))
		}
		m.Costs = costs
		out = append(out, row{Module: m, Enabled: set.Has(m.ID)})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"modules": out,
		"script":  map[string]any{"bytes": sizes.Variants[web.VariantName(set.Tracker())], "core": sizes.Core, "full": sizes.Full, "url": "/js/" + site + ".js"},
	})
}

// fmtBytes writes a measured size the way the texts use it: "183 B",
// "1,025 B".
func fmtBytes(n int) string {
	s := strconv.Itoa(n)
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return s + " B"
}

func (a *API) setModule(w http.ResponseWriter, r *http.Request) {
	site := r.PathValue("site")
	if !a.siteExists(w, r) {
		return
	}
	var in struct {
		Enabled bool `json:"enabled"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if err := (modules.Store{DB: a.Ctl.DB}).Set(r.Context(), site, r.PathValue("module"), in.Enabled); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	a.cache.purgeSite(site)
	a.listModules(w, r)
}
