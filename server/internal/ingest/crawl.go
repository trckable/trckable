package ingest

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// Crawl records a robot's page request, reported by the site's own server.
//
// Crawlers do not run JavaScript, so this is the only way to see them: the
// customer adds one middleware that forwards the user agent and path of
// requests the browser script will never send. Nothing about a person is in
// this payload — no IP, no cookie, no visitor id.
//
//	POST /api/crawl
//	{"s":"tkb_…","u":"https://site/path","ua":"GPTBot/1.2","st":200}
func (h *Handler) Crawl(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var p struct {
		Site   string `json:"s"`
		URL    string `json:"u"`
		UA     string `json:"ua"`
		Status int    `json:"st"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&p); err != nil {
		h.reject(w, http.StatusBadRequest, errBadPayload)
		return
	}
	site, ok := h.Sites.Site(p.Site)
	if !ok {
		h.reject(w, http.StatusNotFound, errUnknown)
		return
	}
	// The reporting server proves itself with the same key the proxy uses, so
	// nobody else can invent crawler traffic for a site.
	if site.ProxyKey == "" || r.Header.Get(proxyKeyHeader) != site.ProxyKey {
		h.reject(w, http.StatusForbidden, errUnknown)
		return
	}
	// After the key check, so nobody learns a site's modules by asking.
	// With the module off nothing is recorded, as the module says. The
	// answer is still 202, so the site's middleware sees no error to log.
	if h.Module != nil && !h.Module(site.ID, "crawlers") {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	u, ok := parsePageURL(p.URL, site.HashMode)
	if !ok || !hostAllowed(u.Host, site, false) {
		h.reject(w, http.StatusBadRequest, errHost)
		return
	}
	c, ok := ClassifyCrawler(p.UA)
	if !ok {
		w.WriteHeader(http.StatusAccepted) // a bot we do not count; say nothing
		return
	}
	if site.Skip(u.Path) {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	now := h.Now()
	e := &event.Event{
		Site:     site.ID,
		Kind:     event.KindCrawler,
		TS:       now.UnixMilli(),
		EventID:  crawlID(now, site.ID, c.Name+"/"+c.Kind, u.Path),
		Hostname: u.Host,
		Path:     clip(u.Path, 512),
		Browser:  c.Name, // the crawler
		OS:       c.Kind, // answer | index | train
	}
	if p.Status >= 400 {
		e.Goal = "error" // a crawler that only finds errors is worth seeing
	}
	b, err := e.Marshal()
	if err != nil {
		h.reject(w, http.StatusBadRequest, errBadPayload)
		return
	}
	if _, err := h.Log.Append(r.Context(), b); err != nil {
		h.reject(w, http.StatusServiceUnavailable, err)
		return
	}
	h.markSeen(site.ID, now)
	w.WriteHeader(http.StatusAccepted)
}

// crawlID is a dedupe key: the same crawler, on the same errand, asking for
// the same path in the same second is one hit, however many middlewares
// report it. The errand matters: GPTBot training and ChatGPT-User answering
// are both OpenAI, and both count.
func crawlID(now time.Time, site, name, path string) uint64 {
	var h uint64 = 14695981039346656037
	for _, part := range []string{site, name, path, now.UTC().Format("20060102150405")} {
		for _, b := range []byte(strings.ToLower(part)) {
			h ^= uint64(b)
			h *= 1099511628211
		}
	}
	return h
}
