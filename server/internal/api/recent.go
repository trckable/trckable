package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"
)

// Event is one stored event as returned by the API.
type Event struct {
	Seq       uint64            `json:"seq"`
	TS        time.Time         `json:"ts"`
	Kind      string            `json:"kind"`
	Visitor   string            `json:"visitor"`
	Session   string            `json:"session"`
	Pageview  string            `json:"pageview,omitempty"`
	Path      string            `json:"path"`
	Hostname  string            `json:"hostname"`
	Channel   string            `json:"channel,omitempty"`
	Referrer  string            `json:"referrer,omitempty"`
	Country   string            `json:"country,omitempty"`
	Browser   string            `json:"browser,omitempty"`
	OS        string            `json:"os,omitempty"`
	Device    string            `json:"device,omitempty"`
	Goal      string            `json:"goal,omitempty"`
	Props     map[string]string `json:"props,omitempty"`
	EngagedMs uint32            `json:"engaged_ms,omitempty"`
	ScrollPct uint8             `json:"scroll_pct,omitempty"`
}

var kinds = map[uint8]string{1: "pageview", 2: "goal", 3: "engagement"}

// Recent serves GET /api/v1/sites/{site}/events?limit=&path_prefix=&after_seq=
// (the dashboard's "Verify installation" and the browser test suite use it).
func Recent(d *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		limit, _ := strconv.Atoi(q.Get("limit"))
		if limit <= 0 || limit > 1000 {
			limit = 100
		}
		after, _ := strconv.ParseUint(q.Get("after_seq"), 10, 64)
		prefix := q.Get("path_prefix")
		rows, err := d.QueryContext(r.Context(), `
			SELECT seq, ts, kind, visitor_id, session_id, coalesce(pageview_id, 0),
			       coalesce(path, ''), coalesce(hostname, ''), coalesce(channel, ''),
			       coalesce(referrer_host, ''), coalesce(country, ''), coalesce(browser, ''),
			       coalesce(os, ''), coalesce(device, ''), coalesce(goal, ''), coalesce(props, ''),
			       coalesce(engaged_ms, 0), coalesce(scroll_pct, 0)
			FROM events
			WHERE site_id = ? AND seq > ? AND (? = '' OR starts_with(path, ?))
			ORDER BY seq DESC LIMIT ?`,
			r.PathValue("site"), after, prefix, prefix, limit)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		out := []Event{}
		for rows.Next() {
			var e Event
			var kind uint8
			var visitor, session, pv uint64
			var props string
			if err := rows.Scan(&e.Seq, &e.TS, &kind, &visitor, &session, &pv, &e.Path, &e.Hostname,
				&e.Channel, &e.Referrer, &e.Country, &e.Browser, &e.OS, &e.Device, &e.Goal, &props,
				&e.EngagedMs, &e.ScrollPct); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			e.Kind = kinds[kind]
			e.Visitor = strconv.FormatUint(visitor, 36)
			e.Session = strconv.FormatUint(session, 36)
			if pv != 0 {
				e.Pageview = strconv.FormatUint(pv, 36)
			}
			if props != "" {
				json.Unmarshal([]byte(props), &e.Props)
			}
			out = append(out, e)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		json.NewEncoder(w).Encode(map[string]any{"events": out})
	}
}
