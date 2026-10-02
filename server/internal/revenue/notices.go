package revenue

import (
	"context"
	"time"
)

// DefaultNoticeDays is how long the provider's raw notice of a payment is
// kept once it has been read into the ledger.
const DefaultNoticeDays = 30

// PruneNotices empties the raw body of every notice that was read into the
// ledger more than days ago. A provider's notice carries the payer's email,
// name and address; the ledger keeps only the amounts, the ids and a keyed
// hash of the email, so after the window nothing in the inbox names anyone.
//
// A site with its own, shorter retention (retention) is held to that instead.
// days <= 0 keeps every notice. The row stays, with its key: a provider's
// retry or a reconciliation must still find it and not store the notice
// again. Notices not yet processed are never touched.
func (s *Service) PruneNotices(ctx context.Context, days int, retention map[string]int) (int64, error) {
	if days <= 0 && len(retention) == 0 {
		return 0, nil
	}
	s.mu.Lock() // not while a rebuild is reading the inbox
	defer s.mu.Unlock()
	now := s.Now()
	cutoff := func(d int) int64 { return now.Add(-time.Duration(d) * 24 * time.Hour).UnixMilli() }
	const blank = `UPDATE pay_inbox SET body = x'' WHERE processed_at IS NOT NULL AND processed_at < ? AND length(body) > 0`
	var total int64
	// The sites with a retention of their own, whichever is shorter.
	for site, r := range retention {
		d := r
		if days > 0 && days < r {
			d = days
		}
		res, err := s.DB.ExecContext(ctx, blank+` AND connection_id IN (SELECT id FROM pay_connections WHERE site_id = ?)`, cutoff(d), site)
		if err != nil {
			return total, err
		}
		n, _ := res.RowsAffected()
		total += n
	}
	if days <= 0 {
		return total, nil
	}
	// Everyone else.
	res, err := s.DB.ExecContext(ctx, blank, cutoff(days))
	if err != nil {
		return total, err
	}
	n, _ := res.RowsAffected()
	return total + n, nil
}
