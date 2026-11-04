package revenue

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"strconv"

	"github.com/trckable/trckable/server/internal/payments"
)

// rulesKey is the meta key holding the payments.RulesVersion the stored
// payments were last read with.
const rulesKey = "pay_rules_version"

// RecalcIfStale reads every site's payments again when the rules that count
// them changed since they were last read (see payments.RulesVersion), one site
// at a time, then remembers the new version. It tells nobody: Reprocess only
// rebuilds the ledger, it announces no payment. A site that fails keeps the
// old version stored, so the next start tries again; Reprocess rebuilds from
// the inbox in one transaction, so running it twice is harmless.
func (s *Service) RecalcIfStale(ctx context.Context) {
	s.recalcTo(ctx, payments.RulesVersion)
}

func (s *Service) recalcTo(ctx context.Context, want int) {
	var raw string
	err := s.DB.QueryRowContext(ctx, `SELECT value FROM meta WHERE key = ?`, rulesKey).Scan(&raw)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		slog.Warn("payments: couldn't read the rules version", "err", err)
		return
	}
	if have, _ := strconv.Atoi(raw); err == nil && have >= want {
		return
	}
	rows, err := s.DB.QueryContext(ctx, `SELECT DISTINCT site_id FROM pay_connections ORDER BY site_id`)
	if err != nil {
		slog.Warn("payments: couldn't list sites to recalculate", "err", err)
		return
	}
	var sites []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			slog.Warn("payments: couldn't read a site to recalculate", "err", err)
			return
		}
		sites = append(sites, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		slog.Warn("payments: couldn't list sites to recalculate", "err", err)
		return
	}
	failed := 0
	for _, id := range sites {
		if ctx.Err() != nil {
			return
		}
		n, err := s.reprocess(ctx, id)
		if err != nil {
			failed++
			slog.Warn("payments: recalculating a site failed, will retry at the next start", "site", id, "err", err)
			continue
		}
		slog.Info("payments: recalculated a site after the counting rules changed", "site", id, "events", n)
	}
	if failed > 0 {
		return
	}
	if _, err := s.DB.ExecContext(ctx,
		`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		rulesKey, strconv.Itoa(want)); err != nil {
		slog.Warn("payments: couldn't save the rules version", "err", err)
	}
}

func (s *Service) reprocess(ctx context.Context, site string) (int, error) {
	if s.reprocessFn != nil {
		return s.reprocessFn(ctx, site)
	}
	return s.Reprocess(ctx, site)
}
