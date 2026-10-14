package api

import (
	"context"
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// What one mention brought, for the Mentions page:
//
//	GET /api/v1/sites/{site}/mentions/curves?period=7d|30d|90d|1y
//	GET /api/v1/sites/{site}/mentions/{id}
//
// Both read the same sessions the mention was scored from: visitors that came
// from its host in [posted - 10 min, posted + 48 h], by hour.

const (
	curveLead    = 10 * time.Minute
	curveSpan    = 48 * time.Hour
	curveBuckets = 49 // hourly, from ten minutes before the posting
	curveMax     = 60 // mentions drawn on the feed at once
	topRows      = 5
)

type namedCount struct {
	Name     string `json:"name"`
	Visitors int64  `json:"visitors"`
}

// curve is the visitors that came from host, hour by hour; all, when host is
// empty, is everyone. The window ends at now.
func mentionCurve(ctx context.Context, db *sql.DB, site, host string, posted, now time.Time) ([]int64, error) {
	from := posted.Add(-curveLead)
	end := from.Add(curveSpan + curveLead)
	if end.After(now) {
		end = now
	}
	out := make([]int64, curveBuckets)
	if !end.After(from) {
		return out, nil
	}
	q := `SELECT CAST(floor((epoch(start) - ?) / 3600) AS INTEGER) AS b, count(DISTINCT visitor_id) FROM sessions
		WHERE site_id = ? AND start >= ? AND start < ?`
	args := []any{float64(from.Unix()), site, from.UTC(), end.UTC()}
	if host != "" {
		q += ` AND referrer = ?`
		args = append(args, host)
	}
	rows, err := db.QueryContext(ctx, q+` GROUP BY b`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var b int
		var n int64
		if err := rows.Scan(&b, &n); err != nil {
			return nil, err
		}
		if b >= 0 && b < curveBuckets {
			out[b] = n
		}
	}
	return out, rows.Err()
}

func (a *API) mentionCurves(w http.ResponseWriter, r *http.Request) {
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	site := r.PathValue("site")
	span := mentionsDefault
	if p := r.URL.Query().Get("period"); p != "" {
		var ok bool
		if span, ok = mentionPeriods[p]; !ok {
			fail(w, http.StatusBadRequest, "period must be 7d, 30d, 90d or 1y")
			return
		}
	}
	now := a.Now()
	list, err := a.Ctl.Mentions(r.Context(), site, now.Add(-span).Unix(), now.Add(time.Hour).Unix(), curveMax)
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the mentions")
		return
	}
	out := map[string][]int64{}
	for _, m := range list {
		if m.Visitors == 0 {
			continue
		}
		c, err := mentionCurve(r.Context(), q.DB, site, m.Host, time.Unix(m.PostedAt, 0), now)
		if err != nil {
			fail(w, http.StatusInternalServerError, "could not read the visits")
			return
		}
		out[strconv.FormatInt(m.ID, 10)] = c
	}
	w.Header().Set("Cache-Control", "private, max-age=30")
	writeJSON(w, http.StatusOK, map[string]any{"curves": out, "step": 3600, "lead": int(curveLead.Seconds())})
}

func (a *API) mentionDetail(w http.ResponseWriter, r *http.Request) {
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	site := r.PathValue("site")
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		fail(w, http.StatusNotFound, "mention not found")
		return
	}
	now := a.Now()
	list, err := a.Ctl.Mentions(r.Context(), site, 0, now.Add(time.Hour).Unix(), 1<<20)
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the mentions")
		return
	}
	var m *sqlite.Mention
	for i := range list {
		if list[i].ID == id {
			m = &list[i]
			break
		}
	}
	if m == nil {
		fail(w, http.StatusNotFound, "mention not found")
		return
	}
	posted := time.Unix(m.PostedAt, 0)
	host, all := []int64(nil), []int64(nil)
	if host, err = mentionCurve(r.Context(), q.DB, site, m.Host, posted, now); err == nil {
		all, err = mentionCurve(r.Context(), q.DB, site, "", posted, now)
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the visits")
		return
	}
	from, end := posted.Add(-curveLead), posted.Add(curveSpan)
	if end.After(now) {
		end = now
	}
	pages, countries, goals, err := mentionBreakdown(r.Context(), q.DB, site, m.Host, from, end)
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the visits")
		return
	}
	w.Header().Set("Cache-Control", "private, max-age=30")
	writeJSON(w, http.StatusOK, map[string]any{
		"mention": m, "curve": host, "usual": all, "step": 3600, "lead": int(curveLead.Seconds()),
		"pages": pages, "countries": countries, "goals": goals,
	})
}

const topPagesSQL = `SELECT entry_page, count(DISTINCT visitor_id) AS n FROM sessions
	WHERE site_id = ? AND start >= ? AND start < ? AND referrer = ? AND coalesce(entry_page, '') <> ''
	GROUP BY 1 ORDER BY n DESC, 1 LIMIT ?`

const topCountriesSQL = `SELECT country, count(DISTINCT visitor_id) AS n FROM sessions
	WHERE site_id = ? AND start >= ? AND start < ? AND referrer = ? AND coalesce(country, '') <> ''
	GROUP BY 1 ORDER BY n DESC, 1 LIMIT ?`

// mentionBreakdown is what the visitors from a host read, where they live and
// how many of them reached a goal.
func mentionBreakdown(ctx context.Context, db *sql.DB, site, host string, from, to time.Time) (pages, countries []namedCount, goals int64, err error) {
	top := func(q string) ([]namedCount, error) {
		rows, err := db.QueryContext(ctx, q, site, from.UTC(), to.UTC(), host, topRows)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		out := []namedCount{}
		for rows.Next() {
			var c namedCount
			if err := rows.Scan(&c.Name, &c.Visitors); err != nil {
				return nil, err
			}
			out = append(out, c)
		}
		return out, rows.Err()
	}
	if pages, err = top(topPagesSQL); err != nil {
		return
	}
	if countries, err = top(topCountriesSQL); err != nil {
		return
	}
	err = db.QueryRowContext(ctx, `SELECT count(DISTINCT visitor_id) FROM sessions
		WHERE site_id = ? AND start >= ? AND start < ? AND referrer = ? AND goals > 0`, site, from.UTC(), to.UTC(), host).Scan(&goals)
	return
}
