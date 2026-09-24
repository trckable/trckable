package revenue

import (
	"context"
	"database/sql"
	"strconv"
	"time"

	"github.com/trckable/trckable/server/internal/ledger"
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

// UnlinkVisitor cuts every payment loose from one visitor: the link to the
// analytics id and the hashed email both go, so the row is money and nothing
// more. The payment itself stays, because it is a business record the owner
// may be required to keep — and it no longer says who made it.
//
// The webhook inbox is a separate matter: it holds the provider's raw payload,
// with the real email and address in it. That is emptied by retention, and the
// caller says so rather than pretending otherwise.
func (s *Service) UnlinkVisitor(ctx context.Context, site string, visitor uint64) (int64, error) {
	id := strconv.FormatInt(int64(visitor), 10)
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx,
		`UPDATE pay_payments SET visitor_id = 0, email_hash = '' WHERE site_id = ? AND visitor_id = `+id, site)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	// Hints are where a visitor id arrives from, so they have to go too, or
	// the next reprocess would link the payment straight back.
	if _, err := tx.ExecContext(ctx,
		`UPDATE pay_hints SET visitor_id = 0 WHERE site_id = ? AND visitor_id = `+id, site); err != nil {
		return 0, err
	}
	return n, tx.Commit()
}
