package api

// Google Search Console: which searches showed the site, and which were
// clicked. It is read from Google each time a report asks (with an hour of
// caching), never copied into trckable's own stores, and it uses a service
// account the owner adds to Search Console as a read-only user.

import (
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/gsc"
	"github.com/trckable/trckable/server/internal/modules"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Search Console refreshes its numbers a few times a day at most, so an hour
// of caching costs nothing in freshness and keeps well inside Google's quota.
const searchTTL = time.Hour

type searchState struct {
	mu      sync.Mutex
	clients map[string]gscClient // site → client for its current key
	answers map[string]searchAnswer
}

type gscClient struct {
	keyEnc string
	c      *gsc.Client
}

type searchAnswer struct {
	at   time.Time
	body map[string]any
}

func (a *API) searchInit() *searchState {
	a.searchOnce.Do(func() {
		a.search = &searchState{clients: map[string]gscClient{}, answers: map[string]searchAnswer{}}
	})
	return a.search
}

// gscFor returns the Google client for a site's stored key. A client keeps
// its access token for an hour, so it is kept for as long as the key is.
func (a *API) gscFor(c sqlite.SearchConsole) (*gsc.Client, error) {
	if a.Box == nil {
		return nil, errors.New("encryption is not configured")
	}
	st := a.searchInit()
	st.mu.Lock()
	defer st.mu.Unlock()
	if e, ok := st.clients[c.SiteID]; ok && e.keyEnc == c.KeyEnc {
		return e.c, nil
	}
	raw, err := a.Box.Open(c.KeyEnc)
	if err != nil {
		return nil, errors.New("the stored key cannot be decrypted: TRCKABLE_SECRET changed. Paste the key again")
	}
	k, err := gsc.ParseKey([]byte(raw))
	if err != nil {
		return nil, err
	}
	cl := gsc.New(k)
	if a.GSCHTTP != nil {
		cl.HTTP = a.GSCHTTP
	}
	st.clients[c.SiteID] = gscClient{keyEnc: c.KeyEnc, c: cl}
	return cl, nil
}

func (a *API) forgetSearch(site string) {
	st := a.searchInit()
	st.mu.Lock()
	defer st.mu.Unlock()
	delete(st.clients, site)
	for k := range st.answers {
		if strings.HasPrefix(k, site+"|") {
			delete(st.answers, k)
		}
	}
}

// searchConsole says whether the site is connected, as which account, to
// which property. It never calls Google, so Settings opens instantly.
func (a *API) searchConsole(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	c, err := a.Ctl.SearchConsoleOf(r.Context(), r.PathValue("site"))
	if errors.Is(err, auth.ErrNotFound) {
		writeJSON(w, http.StatusOK, map[string]any{"connected": false})
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"connected": true, "connection": c})
}

// searchProperties lists what the connected account may read.
func (a *API) searchProperties(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	site := r.PathValue("site")
	c, err := a.Ctl.SearchConsoleOf(r.Context(), site)
	if err != nil {
		fail(w, http.StatusNotFound, "Search Console is not connected")
		return
	}
	cl, err := a.gscFor(c)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	ps, err := cl.Properties(r.Context())
	_ = a.Ctl.SearchConsoleStatus(r.Context(), site, err)
	if err != nil {
		fail(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"properties": ps})
}

// setSearchConsole takes a key, a property, or both. A key is checked with
// Google before it is stored, so a wrong one is refused with Google's reason
// rather than saved and failing later.
func (a *API) setSearchConsole(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	site := r.PathValue("site")
	var in struct {
		Key      string `json:"key"`
		Property string `json:"property"`
	}
	if err := decode(r, &in); err != nil {
		fail(w, http.StatusBadRequest, "bad request")
		return
	}
	if a.Box == nil {
		fail(w, http.StatusServiceUnavailable, "encryption is not configured")
		return
	}
	var props []gsc.Property
	if strings.TrimSpace(in.Key) != "" {
		k, err := gsc.ParseKey([]byte(in.Key))
		if err != nil {
			fail(w, http.StatusBadRequest, err.Error())
			return
		}
		cl := gsc.New(k)
		if a.GSCHTTP != nil {
			cl.HTTP = a.GSCHTTP
		}
		if props, err = cl.Properties(r.Context()); err != nil {
			fail(w, http.StatusBadRequest, err.Error())
			return
		}
		sealed, err := a.Box.Seal(in.Key)
		if err != nil {
			fail(w, http.StatusInternalServerError, err.Error())
			return
		}
		if err := a.Ctl.SetSearchConsoleKey(r.Context(), site, sealed, k.ClientEmail); err != nil {
			fail(w, http.StatusInternalServerError, err.Error())
			return
		}
		a.forgetSearch(site)
		_ = a.Ctl.SearchConsoleStatus(r.Context(), site, nil)
		// Turning the key on is the point of pasting it.
		_ = modules.Store{DB: a.Ctl.DB}.Set(r.Context(), site, "search", true)
		// One property that matches the site is the one people mean.
		if in.Property == "" {
			if si, err := a.Ctl.SiteInfo(r.Context(), site); err == nil {
				if p := matchProperty(props, si.Domain); p != "" {
					in.Property = p
				}
			}
		}
	}
	c, err := a.Ctl.SearchConsoleOf(r.Context(), site)
	if err != nil {
		fail(w, http.StatusBadRequest, "paste a service account key first")
		return
	}
	if in.Property != "" {
		if props == nil {
			cl, err := a.gscFor(c)
			if err != nil {
				fail(w, http.StatusBadRequest, err.Error())
				return
			}
			if props, err = cl.Properties(r.Context()); err != nil {
				fail(w, http.StatusBadGateway, err.Error())
				return
			}
		}
		found := false
		for _, p := range props {
			found = found || p.URL == in.Property
		}
		if !found {
			fail(w, http.StatusBadRequest, "this account cannot read "+in.Property+": add "+c.ClientEmail+" as a user of that property in Search Console")
			return
		}
		if err := a.Ctl.SetSearchConsoleProperty(r.Context(), site, in.Property); err != nil {
			fail(w, http.StatusInternalServerError, err.Error())
			return
		}
		a.forgetSearch(site)
	}
	c, _ = a.Ctl.SearchConsoleOf(r.Context(), site)
	out := map[string]any{"connected": true, "connection": c}
	if props != nil {
		out["properties"] = props
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *API) deleteSearchConsole(w http.ResponseWriter, r *http.Request) {
	if !a.siteExists(w, r) {
		return
	}
	site := r.PathValue("site")
	if err := a.Ctl.DeleteSearchConsole(r.Context(), site); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.forgetSearch(site)
	w.WriteHeader(http.StatusNoContent)
}

// matchProperty picks the property for a site's domain: the whole-domain
// property if there is one, else the https address, with or without www.
func matchProperty(ps []gsc.Property, domain string) string {
	domain = strings.TrimPrefix(strings.ToLower(domain), "www.")
	want := []string{"sc-domain:" + domain, "https://" + domain + "/", "https://www." + domain + "/", "http://" + domain + "/", "http://www." + domain + "/"}
	for _, w := range want {
		for _, p := range ps {
			if strings.EqualFold(p.URL, w) {
				return p.URL
			}
		}
	}
	return ""
}

// searchReport is the Search terms card: the searches that showed the site
// (dim=query) or the pages Google showed (dim=page), for the dashboard's
// period. A page filter narrows it to that page, a device filter to that
// device; other filters have no meaning in Google's data and are listed back
// as ignored, so the card can say so.
func (a *API) searchReport(w http.ResponseWriter, r *http.Request) {
	if !a.needs(w, r, "search") {
		return
	}
	site := r.PathValue("site")
	si, err := a.Ctl.SiteInfo(r.Context(), site)
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	c, err := a.Ctl.SearchConsoleOf(r.Context(), site)
	if err != nil || c.Property == "" {
		fail(w, http.StatusConflict, "Search Console is not connected")
		return
	}
	v := r.URL.Query()
	loc, err := time.LoadLocation(si.Timezone)
	if err != nil {
		loc = time.UTC
	}
	from, to, err := dateRange(v.Get("from"), v.Get("to"), a.Now().In(loc))
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	last := to.AddDate(0, 0, -1) // dateRange's end is exclusive; Google's is not
	dim := v.Get("dim")
	if dim == "" {
		dim = "query"
	}
	if dim != "query" && dim != "page" {
		fail(w, http.StatusBadRequest, "dim must be query or page")
		return
	}
	filters, err := parseFilters(v["f"])
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	q := gsc.Query{From: from, To: last, Dimension: dim, Limit: 100}
	var ignored []string
	for _, f := range filters {
		switch f.Dim {
		case "page", "entry_page":
			q.Page = f.Value
		case "device":
			q.Device = strings.ToUpper(f.Value)
		default:
			ignored = append(ignored, f.Dim)
		}
	}
	key := strings.Join([]string{site, c.Property, dim, from.Format("2006-01-02"), last.Format("2006-01-02"), q.Page, q.Device}, "|")
	st := a.searchInit()
	st.mu.Lock()
	if ans, ok := st.answers[key]; ok && a.Now().Sub(ans.at) < searchTTL {
		st.mu.Unlock()
		body := ans.body
		body["ignored_filters"] = ignored
		writeJSON(w, http.StatusOK, body)
		return
	}
	st.mu.Unlock()
	cl, err := a.gscFor(c)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	rows, err := cl.Search(r.Context(), c.Property, q)
	_ = a.Ctl.SearchConsoleStatus(r.Context(), site, err)
	if err != nil {
		fail(w, http.StatusBadGateway, err.Error())
		return
	}
	var clicks, impressions float64
	for _, row := range rows {
		clicks += row.Clicks
		impressions += row.Impressions
	}
	body := map[string]any{
		"property": c.Property, "dim": dim, "rows": rows,
		"from": from.Format("2006-01-02"), "to": last.Format("2006-01-02"),
		"clicks": clicks, "impressions": impressions,
		// Google revises its last two or three days; the card marks them.
		"preliminary_from": a.Now().In(loc).AddDate(0, 0, -3).Format("2006-01-02"),
	}
	st.mu.Lock()
	st.answers[key] = searchAnswer{at: a.Now(), body: body}
	st.mu.Unlock()
	out := map[string]any{}
	for k, v := range body {
		out[k] = v
	}
	out["ignored_filters"] = ignored
	writeJSON(w, http.StatusOK, out)
}
