package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// Usage is what an operator reads about an instance they run for someone
// else: how much it recorded, whether anyone used it, and how many people can
// change it. It is a count, never content: no paths, no visitors, no emails.
type Usage struct {
	Version string `json:"version"`
	// Months are the billable events per calendar month (UTC), newest first:
	// pageviews and goals as they happened. Robots are never stored, and
	// imported history is left out — it is not traffic.
	Months      []UsageMonth `json:"months"`
	LastEventAt int64        `json:"last_event_at"` // unix seconds, 0 when never
	LastSeenAt  int64        `json:"last_seen_at"`  // someone signed in and used the dashboard
	Sites       int          `json:"sites"`
	Owners      int          `json:"owners"`
	Viewers     int          `json:"viewers"`
	Payments    UsagePay     `json:"payments"`
}

// UsageMonth is one month on the meter.
type UsageMonth struct {
	Month  string `json:"month"` // "2026-09"
	Events int64  `json:"events"`
}

// UsagePay says whether revenue tracking is set up and has seen a sale.
type UsagePay struct {
	Connected int   `json:"connected"`
	Sales30d  int64 `json:"sales_30d"` // real (not test) payments in the last 30 days
}

// usageMonths is how far back the meter looks: enough for a three-month
// average ending with the month in progress.
const usageMonths = 4

// usage serves GET /_trckable/usage to the operator, with
// TRCKABLE_OPERATOR_TOKEN as a bearer token. Without that token configured
// the endpoint answers 404, as if it did not exist.
func (s *Server) usage(w http.ResponseWriter, r *http.Request) {
	tok := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if s.cfg.OperatorToken == "" {
		http.NotFound(w, r)
		return
	}
	if !auth.Equal(tok, s.cfg.OperatorToken) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	u, ok := s.readUsage(r.Context(), r.URL.Query().Get("account"), time.Now())
	if !ok {
		// Counting needs the analytics store: ask again once it is warm,
		// rather than billing a zero.
		w.Header().Set("Retry-After", "30")
		http.Error(w, "analytics store warming up", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(u)
}

// readUsage counts the whole installation, or one account's sites when
// account is set (a hosted service bills each account separately).
func (s *Server) readUsage(ctx context.Context, account string, now time.Time) (Usage, bool) {
	u := Usage{Version: Version, Months: []UsageMonth{}}
	st := s.duck.Load()
	if st == nil || s.writer.Load() == nil {
		return u, false
	}
	// The account's sites, as a filter both stores understand.
	siteFilter, siteArgs := "", []any{}
	if account != "" {
		sites, err := s.ctl.ListSites(ctx, account)
		if err != nil {
			return u, false
		}
		ids := make([]string, 0, len(sites))
		for _, st := range sites {
			ids = append(ids, st.ID)
		}
		if len(ids) == 0 {
			ids = append(ids, "") // matches nothing: an account with no sites counts zero
		}
		siteFilter = " AND site_id IN (" + strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",") + ")"
		for _, id := range ids {
			siteArgs = append(siteArgs, id)
		}
	}
	start := time.Date(now.UTC().Year(), now.UTC().Month(), 1, 0, 0, 0, 0, time.UTC).AddDate(0, -(usageMonths - 1), 0)
	rows, err := st.DB.QueryContext(ctx, `
		SELECT strftime(ts, '%Y-%m') AS month, count(*) FROM events
		WHERE ts >= ? AND kind IN (1, 2) AND imported IS NOT TRUE`+siteFilter+`
		GROUP BY 1 ORDER BY 1 DESC`, append([]any{start}, siteArgs...)...)
	if err != nil {
		return u, false
	}
	got := map[string]int64{}
	for rows.Next() {
		var m string
		var n int64
		if rows.Scan(&m, &n) == nil {
			got[m] = n
		}
	}
	rows.Close()
	// Every month appears, zeros included: a sleeping month is a fact.
	for i := 0; i < usageMonths; i++ {
		m := start.AddDate(0, usageMonths-1-i, 0).Format("2006-01")
		u.Months = append(u.Months, UsageMonth{Month: m, Events: got[m]})
	}

	db := s.ctl.DB
	accountFilter, accountArgs := "", []any{}
	if account != "" {
		accountFilter, accountArgs = " WHERE account_id = ?", []any{account}
	}
	db.QueryRowContext(ctx, `SELECT count(*), coalesce(max(last_event_at), 0) FROM sites`+accountFilter, accountArgs...).Scan(&u.Sites, &u.LastEventAt)
	db.QueryRowContext(ctx, `SELECT coalesce(max(last_seen_at), 0),
		count(*) FILTER (WHERE role = 'owner'), count(*) FILTER (WHERE role <> 'owner') FROM users`+accountFilter, accountArgs...).Scan(&u.LastSeenAt, &u.Owners, &u.Viewers)
	paySites := strings.Replace(siteFilter, " AND ", " WHERE ", 1)
	db.QueryRowContext(ctx, `SELECT count(*) FROM pay_connections`+paySites, siteArgs...).Scan(&u.Payments.Connected)
	db.QueryRowContext(ctx, `SELECT count(*) FROM pay_payments WHERE test = 0 AND paid_at >= ?`+siteFilter,
		append([]any{now.Add(-30 * 24 * time.Hour).Unix()}, siteArgs...)...).Scan(&u.Payments.Sales30d)
	return u, true
}

// backupNow serves GET /_trckable/backup to the operator: a fresh, complete
// backup of the whole instance, streamed. It is how someone who runs
// instances for others hands a customer their data to take home, without
// access to the disk. The file is encrypted with the instance's own key.
func (s *Server) backupNow(w http.ResponseWriter, r *http.Request) {
	if s.cfg.OperatorToken == "" {
		http.NotFound(w, r)
		return
	}
	if !auth.Equal(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), s.cfg.OperatorToken) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if s.duck.Load() == nil {
		w.Header().Set("Retry-After", "30")
		http.Error(w, "analytics store warming up", http.StatusServiceUnavailable)
		return
	}
	res, err := s.Backup(r.Context())
	if err != nil {
		http.Error(w, "backup failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	s.pruneBackups()
	f, err := os.Open(res.Path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer f.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filepath.Base(res.Path)+`"`)
	w.Header().Set("Content-Length", strconv.FormatInt(res.Bytes, 10))
	w.Header().Set("Cache-Control", "no-store")
	io.Copy(w, f)
}
