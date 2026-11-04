package revenue

import (
	"context"
	"log/slog"
	"strconv"

	"github.com/trckable/trckable/server/internal/payments"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// rulesKey is the meta key prefix holding, per site, the payments.RulesVersion
// that site's stored payments were last read with.
const rulesKey = "pay_rules_version:"

// RecalcIfStale reads a site's payments again when the rules that count them
// changed since they were last read (see payments.RulesVersion), one site at a
// time, and remembers the version per site. It tells nobody: Reprocess only
// rebuilds the ledger from rows already applied, it announces no payment. A
// site that fails keeps its old version, so only it is tried again at the
// next start; Reprocess rebuilds in one transaction, so a second run is harmless.
func (s *Service) RecalcIfStale(ctx context.Context) {
	s.recalcTo(ctx, payments.RulesVersion)
}

func (s *Service) recalcTo(ctx context.Context, want int) {
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
	st := &sqlite.Store{DB: s.DB}
	for _, id := range sites {
		if ctx.Err() != nil {
			return
		}
		raw, _, err := st.Meta(ctx, rulesKey+id)
		if err != nil {
			slog.Warn("payments: couldn't read the rules version", "site", id, "err", err)
			continue
		}
		if have, _ := strconv.Atoi(raw); have >= want {
			continue
		}
		n, err := s.reprocess(ctx, id)
		if err != nil {
			slog.Warn("payments: recalculating a site failed, will retry at the next start", "site", id, "err", err)
			continue
		}
		slog.Info("payments: recalculated a site after the counting rules changed", "site", id, "events", n)
		if err := st.SetMeta(ctx, rulesKey+id, strconv.Itoa(want)); err != nil {
			slog.Warn("payments: couldn't save the rules version", "site", id, "err", err)
		}
	}
}

func (s *Service) reprocess(ctx context.Context, site string) (int, error) {
	if s.reprocessFn != nil {
		return s.reprocessFn(ctx, site)
	}
	return s.Reprocess(ctx, site)
}
