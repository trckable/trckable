package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/mail"
	"slices"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// A report schedule sends a site's numbers to the people who pay for them: a
// client, a board, a partner. Weekly or monthly, by email with an optional
// PDF, to a short list of addresses, in the client's language.

// ReportSchedule is one schedule. Recipients are tidied addresses.
type ReportSchedule struct {
	ID         string   `json:"id"`
	SiteID     string   `json:"site_id"`
	Name       string   `json:"name"` // who it is for, said at the top of the report
	Cadence    string   `json:"cadence"`
	Lang       string   `json:"lang"`
	PDF        bool     `json:"pdf"`
	Recipients []string `json:"recipients"`
	Enabled    bool     `json:"enabled"`
	LastSent   int64    `json:"last_sent"`
	CreatedAt  int64    `json:"created_at"`
}

// Limits: enough for any agency, small enough that nothing is a mailing list.
const (
	MaxRecipients       = 10
	MaxSchedulesPerSite = 5
	MaxScheduleName     = 60
)

// ReportCadences and ReportLangs are what a schedule may say. The languages
// are the ones reports/lang.go has words for.
var (
	ReportCadences = []string{"weekly", "monthly"}
	ReportLangs    = []string{"en", "de", "fr", "es", "it", "nl"}
)

// ErrSchedule is a schedule that cannot be kept; the message says why.
type ErrSchedule struct{ Why string }

func (e ErrSchedule) Error() string { return e.Why }

// CleanRecipients validates a list of addresses: plain addresses only (no
// display names), lower case, each once, at most MaxRecipients.
func CleanRecipients(in []string) ([]string, error) {
	out := []string{}
	for _, raw := range in {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		a, err := mail.ParseAddress(raw)
		if err != nil || a.Address != raw || strings.ContainsAny(raw, "\r\n<>,;") || !strings.Contains(a.Address[strings.LastIndexByte(a.Address, '@'):], ".") {
			return nil, ErrSchedule{fmt.Sprintf("%q is not an email address", raw)}
		}
		low := strings.ToLower(raw)
		if !slices.Contains(out, low) {
			out = append(out, low)
		}
	}
	if len(out) > MaxRecipients {
		return nil, ErrSchedule{fmt.Sprintf("a report goes to %d addresses at most", MaxRecipients)}
	}
	return out, nil
}

func (r ReportSchedule) check() (ReportSchedule, error) {
	r.Name = strings.TrimSpace(r.Name)
	if len([]rune(r.Name)) > MaxScheduleName || strings.ContainsAny(r.Name, "\r\n") {
		return r, ErrSchedule{fmt.Sprintf("keep the name under %d characters", MaxScheduleName)}
	}
	if !slices.Contains(ReportCadences, r.Cadence) {
		return r, ErrSchedule{"a report is weekly or monthly"}
	}
	if !slices.Contains(ReportLangs, r.Lang) {
		return r, ErrSchedule{"that language is not one of the report's"}
	}
	var err error
	if r.Recipients, err = CleanRecipients(r.Recipients); err != nil {
		return r, err
	}
	return r, nil
}

const reportCols = `id, site_id, name, cadence, lang, pdf, recipients, enabled, last_sent, created_at`

func scanSchedule(row interface{ Scan(...any) error }) (ReportSchedule, error) {
	var r ReportSchedule
	var pdf, on int
	var rec string
	if err := row.Scan(&r.ID, &r.SiteID, &r.Name, &r.Cadence, &r.Lang, &pdf, &rec, &on, &r.LastSent, &r.CreatedAt); err != nil {
		return r, err
	}
	r.PDF, r.Enabled, r.Recipients = pdf == 1, on == 1, splitLines(rec)
	if r.Recipients == nil {
		r.Recipients = []string{}
	}
	return r, nil
}

func (s *Store) schedules(ctx context.Context, where string, args ...any) ([]ReportSchedule, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT `+reportCols+` FROM report_schedules `+where, args...) //nolint:gosec // where is one of the fixed clauses in this file; every value travels as an argument
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ReportSchedule{}
	for rows.Next() {
		r, err := scanSchedule(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ReportSchedules lists a site's schedules.
func (s *Store) ReportSchedules(ctx context.Context, site string) ([]ReportSchedule, error) {
	return s.schedules(ctx, `WHERE site_id = ? ORDER BY created_at, id`, site)
}

// LiveReportSchedules lists every enabled schedule that has someone to send
// to, across sites (for the sender).
func (s *Store) LiveReportSchedules(ctx context.Context) ([]ReportSchedule, error) {
	return s.schedules(ctx, `WHERE enabled = 1 AND recipients <> '' ORDER BY created_at, id`)
}

// ReportScheduleByID reads one schedule, whatever site it is on (for the
// link in an email, which names only the schedule).
func (s *Store) ReportScheduleByID(ctx context.Context, id string) (ReportSchedule, error) {
	r, err := scanSchedule(s.DB.QueryRowContext(ctx, `SELECT `+reportCols+` FROM report_schedules WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return r, auth.ErrNotFound
	}
	return r, err
}

// SaveReportSchedule adds a schedule (empty ID) or changes one of the same
// site. A schedule's id from another site changes nothing and reads as not
// found.
func (s *Store) SaveReportSchedule(ctx context.Context, in ReportSchedule) (ReportSchedule, error) {
	r, err := in.check()
	if err != nil {
		return r, err
	}
	rec := strings.Join(r.Recipients, "\n")
	if r.ID == "" {
		var n int
		if err := s.DB.QueryRowContext(ctx, `SELECT count(*) FROM report_schedules WHERE site_id = ?`, r.SiteID).Scan(&n); err != nil {
			return r, err
		}
		if n >= MaxSchedulesPerSite {
			return r, ErrSchedule{fmt.Sprintf("a site can have %d report schedules at most", MaxSchedulesPerSite)}
		}
		r.ID, r.CreatedAt = auth.Token("rep_", 8), time.Now().Unix()
		_, err = s.DB.ExecContext(ctx, `INSERT INTO report_schedules (`+reportCols+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
			r.ID, r.SiteID, r.Name, r.Cadence, r.Lang, boolInt(r.PDF), rec, boolInt(r.Enabled), r.CreatedAt)
		return r, err
	}
	// A new cadence starts clean: the last send says nothing about it.
	res, err := s.DB.ExecContext(ctx, `UPDATE report_schedules SET name = ?, cadence = ?, lang = ?, pdf = ?, recipients = ?, enabled = ?,
		last_sent = CASE WHEN cadence = ? THEN last_sent ELSE 0 END WHERE id = ? AND site_id = ?`,
		r.Name, r.Cadence, r.Lang, boolInt(r.PDF), rec, boolInt(r.Enabled), r.Cadence, r.ID, r.SiteID)
	if err != nil {
		return r, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return r, auth.ErrNotFound
	}
	return s.ReportScheduleByID(ctx, r.ID)
}

// DeleteReportSchedule removes a site's schedule.
func (s *Store) DeleteReportSchedule(ctx context.Context, site, id string) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM report_schedules WHERE id = ? AND site_id = ?`, id, site)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrNotFound
	}
	return nil
}

// MarkReportSent records that a schedule's report went out now.
func (s *Store) MarkReportSent(ctx context.Context, id string, at int64) {
	// Best effort: a missed mark sends the period once more at worst, and the
	// next check tries to mark it again.
	_, _ = s.DB.ExecContext(ctx, `UPDATE report_schedules SET last_sent = ? WHERE id = ?`, at, id)
}

// RemoveReportRecipient takes one address off a schedule, as its owner's own
// link does. It is idempotent: an address that is already gone is a success.
func (s *Store) RemoveReportRecipient(ctx context.Context, id, email string) error {
	r, err := s.ReportScheduleByID(ctx, id)
	if err != nil {
		return err
	}
	email = strings.ToLower(strings.TrimSpace(email))
	keep := []string{}
	for _, a := range r.Recipients {
		if a != email {
			keep = append(keep, a)
		}
	}
	_, err = s.DB.ExecContext(ctx, `UPDATE report_schedules SET recipients = ? WHERE id = ?`, strings.Join(keep, "\n"), id)
	return err
}
