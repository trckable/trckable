package revenue

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/ledger"
	"github.com/trckable/trckable/server/internal/payments"
)

// The money side of a data request. Two things happen here and nowhere else:
// finding the visitor behind an email address, and cutting a payment loose
// from the person who made it.

// VisitorForEmail finds the visitor a payment was linked to, from the email
// address used at checkout. The stored form is a keyed hash, so the address
// itself is hashed the same way and never has to be kept.
func (s *Service) VisitorForEmail(ctx context.Context, site, email string) (uint64, error) {
	hash := ledger.EmailHash(s.emailKey, email)
	if hash == "" {
		return 0, nil
	}
	var id int64
	err := s.DB.QueryRowContext(ctx,
		`SELECT visitor_id FROM pay_payments WHERE site_id = ? AND email_hash = ? AND visitor_id <> 0 ORDER BY paid_at DESC LIMIT 1`,
		site, hash).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return uint64(id), err
}

// PersonPayment is one payment as a data export shows it: what was paid and
// when, with no customer record attached, because trckable keeps none.
type PersonPayment struct {
	Provider string    `json:"provider"`
	ID       string    `json:"id"`
	PaidAt   time.Time `json:"paid_at"`
	Currency string    `json:"currency"`
	Gross    int64     `json:"gross"`
	Tax      int64     `json:"tax,omitempty"`
	Kind     string    `json:"kind"`
	Test     bool      `json:"test,omitempty"`
}

// PaymentsOf lists the payments attributed to one visitor.
func (s *Service) PaymentsOf(ctx context.Context, site string, visitor uint64) ([]PersonPayment, error) {
	rows, err := s.DB.QueryContext(ctx,
		`SELECT provider, id, paid_at, currency, gross, coalesce(tax, 0), kind, test
		 FROM pay_payments WHERE site_id = ? AND visitor_id = ? ORDER BY paid_at`,
		site, int64(visitor))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PersonPayment{}
	for rows.Next() {
		var p PersonPayment
		var at int64
		var test int
		if err := rows.Scan(&p.Provider, &p.ID, &at, &p.Currency, &p.Gross, &p.Tax, &p.Kind, &test); err != nil {
			return nil, err
		}
		p.PaidAt, p.Test = time.Unix(at, 0).UTC(), test == 1
		out = append(out, p)
	}
	return out, rows.Err()
}

// ErasePayer cuts every payment loose from one person and forgets them for
// good. The payments stay, because they are business records the owner may be
// required to keep, but nothing on them points at a person any more:
//
//   - the link to the analytics id and the hashed email go from the payments
//     and from the hints a link could be rebuilt from;
//   - the provider's raw notices about those payments, which carry the real
//     email and address, are deleted from the webhook inbox;
//   - the person is remembered as erased (their email's keyed hash and their
//     payment ids, never the address), so a later webhook, reconciliation or
//     reprocess cannot link them back.
//
// email may be empty when the request named a visitor, not an address.
func (s *Service) ErasePayer(ctx context.Context, site string, visitor uint64, email string) (unlinked, dropped int64, err error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()
	now := s.Now().Unix()
	remember := func(kind, value string) error {
		if value == "" {
			return nil
		}
		_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO pay_erased (site_id, kind, value, erased_at) VALUES (?, ?, ?, ?)`, site, kind, value, now)
		return err
	}
	hash := ledger.EmailHash(s.emailKey, email)
	if err := remember("email", hash); err != nil {
		return 0, 0, err
	}
	// Every payment that is theirs: linked to the visitor, or paid with the
	// address. Their emails' hashes are remembered too, so a renewal paid with
	// the same address stays unlinked.
	rows, err := tx.QueryContext(ctx,
		`SELECT provider, id, email_hash FROM pay_payments WHERE site_id = ? AND ((visitor_id <> 0 AND visitor_id = ?) OR (email_hash <> '' AND email_hash = ?))`,
		site, int64(visitor), hash)
	if err != nil {
		return 0, 0, err
	}
	type pay struct{ provider, id, hash string }
	var mine []pay
	for rows.Next() {
		var p pay
		if err := rows.Scan(&p.provider, &p.id, &p.hash); err != nil {
			rows.Close()
			return 0, 0, err
		}
		mine = append(mine, p)
	}
	rows.Close()
	for _, p := range mine {
		if err := remember("payment", p.provider+":"+p.id); err != nil {
			return 0, 0, err
		}
		if err := remember("email", p.hash); err != nil {
			return 0, 0, err
		}
	}
	if visitor != 0 {
		// Hints are where a visitor id arrives from, so they go too.
		if _, err := tx.ExecContext(ctx, `UPDATE pay_hints SET visitor_id = 0 WHERE site_id = ? AND visitor_id = ?`, site, int64(visitor)); err != nil {
			return 0, 0, err
		}
		// Their customer and subscription links credit renewals to them: the
		// links are remembered (as ids, never the person) and removed, so a
		// later payment by the same customer is not linked back.
		lrows, err := tx.QueryContext(ctx, `SELECT provider || ':' || kind || ':' || key FROM pay_links WHERE site_id = ? AND visitor_id = ?`, site, int64(visitor))
		if err != nil {
			return 0, 0, err
		}
		var links []string
		for lrows.Next() {
			var l string
			if err := lrows.Scan(&l); err != nil {
				lrows.Close()
				return 0, 0, err
			}
			links = append(links, l)
		}
		lrows.Close()
		for _, l := range links {
			if err := remember("link", l); err != nil {
				return 0, 0, err
			}
		}
	}
	if unlinked, err = forgetErased(ctx, tx, site); err != nil {
		return 0, 0, err
	}
	// The raw notices: any inbox body that names one of their payments, or
	// their address when the request gave one.
	needles := make([]string, 0, len(mine)+1)
	for _, p := range mine {
		needles = append(needles, p.id)
	}
	if e := strings.TrimSpace(email); e != "" {
		needles = append(needles, strings.ToLower(e))
	}
	for _, n := range needles {
		res, err := tx.ExecContext(ctx,
			`DELETE FROM pay_inbox WHERE connection_id IN (SELECT id FROM pay_connections WHERE site_id = ?) AND processed_at IS NOT NULL AND instr(lower(CAST(body AS TEXT)), ?) > 0`,
			site, strings.ToLower(n))
		if err != nil {
			return 0, 0, err
		}
		k, _ := res.RowsAffected()
		dropped += k
	}
	return unlinked, dropped, tx.Commit()
}

// forgetErased unlinks every payment an erased person made: by payment id, or
// by the keyed hash of the address it was paid with. It runs after every
// batch the inbox applies, so nothing that arrives later links them again.
func forgetErased(ctx context.Context, tx *sql.Tx, site string) (int64, error) {
	res, err := tx.ExecContext(ctx, `UPDATE pay_payments SET visitor_id = 0, email_hash = ''
		WHERE site_id = ? AND (visitor_id <> 0 OR email_hash <> '') AND (
			email_hash IN (SELECT value FROM pay_erased WHERE site_id = ? AND kind = 'email') OR
			provider || ':' || id IN (SELECT value FROM pay_erased WHERE site_id = ? AND kind = 'payment'))`, site, site, site)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	if _, err = tx.ExecContext(ctx, `UPDATE pay_hints SET visitor_id = 0
		WHERE site_id = ? AND visitor_id <> 0 AND provider || ':' || payment_id IN (SELECT value FROM pay_erased WHERE site_id = ? AND kind = 'payment')`, site, site); err != nil {
		return n, err
	}
	// A customer or subscription link of an erased person, however it came
	// back, goes again.
	_, err = tx.ExecContext(ctx, `DELETE FROM pay_links
		WHERE site_id = ? AND provider || ':' || kind || ':' || key IN (SELECT value FROM pay_erased WHERE site_id = ? AND kind = 'link')`, site, site)
	return n, err
}

// erasedEvent reports whether an event is about a person who was erased, and
// remembers any new payment of theirs it carries (a renewal, say) so that one
// stays unlinked too. Its inbox row is then dropped instead of kept.
func erasedEvent(ctx context.Context, tx *sql.Tx, sc ledger.Scope, ev payments.Event) (bool, error) {
	hit := false
	for _, p := range ev.Payments {
		var n int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM pay_erased WHERE site_id = ? AND ((kind = 'payment' AND value = ?) OR (kind = 'email' AND value = ?))`,
			sc.Site, sc.Provider+":"+p.ID, ledger.EmailHash(sc.EmailKey, p.Email)).Scan(&n); err != nil {
			return false, err
		}
		if n > 0 {
			hit = true
			if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO pay_erased (site_id, kind, value, erased_at) VALUES (?, 'payment', ?, strftime('%s','now'))`, sc.Site, sc.Provider+":"+p.ID); err != nil {
				return false, err
			}
		}
	}
	for _, r := range ev.Refunds {
		var n int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM pay_erased WHERE site_id = ? AND kind = 'payment' AND value = ?`, sc.Site, sc.Provider+":"+r.PaymentID).Scan(&n); err != nil {
			return false, err
		}
		hit = hit || n > 0
	}
	return hit, nil
}
