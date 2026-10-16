package revenue

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/fx"
	"github.com/trckable/trckable/server/internal/ledger"
	"github.com/trckable/trckable/server/internal/payments"
)

// What a notice is about.
const (
	NoticeNew     = "new"     // the first payment of a customer
	NoticeUpgrade = "upgrade" // a charged change of plan
	NoticeRenewal = "renewal"
	NoticeSale    = "sale" // a one-time sale
	NoticeRefund  = "refund"
)

// Notice is money that moved, told the moment the ledger has it: what and how
// much, never who paid. Sales are told once (the first time a payment reaches
// the ledger), and a refund once for each part of it.
type Notice struct {
	At       int64  // unix ms: when it was paid or refunded
	Kind     string // new | upgrade | renewal | sale | refund
	Amount   int64  // net of tax when tax is known, minor units; a refund: what went back
	Currency string // ISO 4217
	Exponent int
	From, To string // upgrade: the plans left and taken, when the payload named them
	Visitor  uint64 // who earned a new customer or a sale; the server turns it into a source
	// Late: found by a reconciliation after the live window. It still gets its
	// notice, with its real time, but is not shown arriving.
	Late bool
}

// liveWindow is how recent a payment must be to be shown arriving. A
// reconciliation that finds one from last week is filling a gap, not reporting
// a sale.
const liveWindow = 10 * time.Minute

// lateWindow is how old a payment can be and still be told about when it is
// found late. Older ones are history, not news: connecting a provider brings
// in its past without sending a message for each payment.
const lateWindow = 3 * 24 * time.Hour

// Words is the notice in plain words, for the bell, the Live pulse and the
// emails: "New customer · $42 · via Google". The source is only said when it
// is known, and the plans only when the payload named them.
func (n Notice) Words(source string) string {
	amount := Money(n.Amount, n.Currency, n.Exponent)
	var parts []string
	switch n.Kind {
	case NoticeNew:
		parts = []string{"New customer", amount}
	case NoticeUpgrade:
		parts = []string{"Upgrade"}
		switch {
		case n.From != "" && n.To != "":
			parts = append(parts, n.From+" → "+n.To)
		case n.To != "":
			parts = append(parts, "to "+n.To)
		}
		parts = append(parts, "+"+amount)
	case NoticeRenewal:
		parts = []string{"Renewal", amount}
	case NoticeRefund:
		parts = []string{"Refund", "−" + amount}
	default:
		parts = []string{"Sale", amount}
	}
	if source != "" && (n.Kind == NoticeNew || n.Kind == NoticeSale) {
		parts = append(parts, "via "+source)
	}
	return strings.Join(parts, " · ")
}

// Money writes minor units for a notice: whole when there are no cents
// ("$42"), with them otherwise ("$41.90").
func Money(minor int64, cur string, exp int) string {
	p := int64(1)
	for range exp {
		p *= 10
	}
	whole, frac := minor/p, minor%p
	num := groups(whole)
	if frac != 0 {
		num += fmt.Sprintf(".%0*d", exp, frac)
	}
	if sym := map[string]string{"USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥"}[cur]; sym != "" {
		return sym + num
	}
	return num + " " + cur
}

func groups(n int64) string {
	s := fmt.Sprint(n)
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return s
}

// age classes a payment by how long ago it happened.
func (s *Service) age(at int64) (late, history bool) {
	d := s.Now().Sub(time.UnixMilli(at))
	return d > liveWindow, d > lateWindow
}

// hintFacts is what the hints about a payment add to it: the kind its invoice
// or order says, the plans of an upgrade, the tax and the visitor.
type hintFacts struct {
	kind, from, to string
	tax            sql.NullInt64
	visitor        int64
	customer, sub  string
}

func hintsOf(ctx context.Context, tx *sql.Tx, sc ledger.Scope, id string) (h hintFacts, err error) {
	rows, err := tx.QueryContext(ctx, `SELECT kind, from_plan, to_plan, tax, visitor_id, customer_id, subscription_id FROM pay_hints
		WHERE site_id = ?1 AND provider = ?2 AND (payment_id = ?3 OR payment_id IN (SELECT alias FROM pay_aliases WHERE site_id = ?1 AND provider = ?2 AND payment_id = ?3))
		ORDER BY version`, sc.Site, sc.Provider, id)
	if err != nil {
		return h, err
	}
	defer rows.Close()
	for rows.Next() {
		var kind, from, to, cus, sub string
		var tax sql.NullInt64
		var vis int64
		if err := rows.Scan(&kind, &from, &to, &tax, &vis, &cus, &sub); err != nil {
			return h, err
		}
		// An upgrade outranks the renewal the same invoice also says.
		if kind != "" && (h.kind == "" || kind == payments.KindUpgrade || h.kind != payments.KindUpgrade) {
			h.kind = kind
		}
		if from != "" {
			h.from = from
		}
		if to != "" {
			h.to = to
		}
		if tax.Valid {
			h.tax = tax
		}
		if vis != 0 {
			h.visitor = vis
		}
		if cus != "" {
			h.customer = cus
		}
		if sub != "" {
			h.sub = sub
		}
	}
	return h, rows.Err()
}

// payNotice words a payment that has just reached the ledger, and records
// that it was told. ok is false when it was told before, or is not worth a
// notice (no money, or too old to be news and recorded as history).
func (s *Service) payNotice(ctx context.Context, tx *sql.Tx, sc ledger.Scope, p payments.Payment) (n Notice, ok bool, err error) {
	h, err := hintsOf(ctx, tx, sc, p.ID)
	if err != nil {
		return n, false, err
	}
	net := p.Gross
	switch {
	case p.Tax != nil:
		net -= *p.Tax
	case h.tax.Valid:
		net -= h.tax.Int64
	}
	cur := strings.ToUpper(p.Currency)
	net = ledger.RoundDiv(net, payments.AmountScale(sc.Provider, cur))
	if net <= 0 {
		return n, false, nil
	}
	kind := p.Kind
	if h.kind != "" && (kind == "" || kind == payments.KindOneTime) {
		kind = h.kind
	}
	n = Notice{At: p.PaidAt, Amount: net, Currency: cur, Exponent: fx.Exponent(cur), Visitor: p.Visitor}
	switch kind {
	case payments.KindSubscription:
		n.Kind = NoticeNew
	case payments.KindRenewal:
		n.Kind = NoticeRenewal
	case payments.KindUpgrade:
		n.Kind, n.From, n.To = NoticeUpgrade, h.from, h.to
	default:
		n.Kind = NoticeSale
	}
	if h.kind == payments.KindUpgrade && kind != payments.KindUpgrade && kind != payments.KindSubscription {
		n.Kind, n.From, n.To = NoticeUpgrade, h.from, h.to
	}
	if n.Visitor == 0 {
		n.Visitor = uint64(h.visitor) //nolint:gosec // visitor ids are stored bit for bit in SQLite's signed integer and read back the same way
	}
	if n.Visitor == 0 && (n.Kind == NoticeNew || n.Kind == NoticeSale) {
		n.Visitor = s.linkedVisitor(ctx, tx, sc, firstOf(p.CustomerID, h.customer), firstOf(p.SubscriptionID, h.sub))
	}
	late, history := s.age(n.At)
	res, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO pay_notices (site_id, provider, id, kind, amount, at) VALUES (?, ?, ?, ?, ?, ?)`,
		sc.Site, sc.Provider, p.ID, n.Kind, net, n.At)
	if err != nil {
		return n, false, err
	}
	if told, _ := res.RowsAffected(); told == 0 || history {
		return n, false, nil
	}
	n.Late = late
	return n, true, nil
}

func firstOf(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

// linkedVisitor is the visitor a customer or subscription was first tied to.
func (s *Service) linkedVisitor(ctx context.Context, tx *sql.Tx, sc ledger.Scope, customer, sub string) uint64 {
	for _, k := range []string{sub, customer} {
		if k == "" {
			continue
		}
		var v int64
		if tx.QueryRowContext(ctx, `SELECT visitor_id FROM pay_links WHERE site_id = ? AND provider = ? AND key = ? AND visitor_id <> 0 LIMIT 1`, sc.Site, sc.Provider, k).Scan(&v) == nil {
			return uint64(v) //nolint:gosec // visitor ids are stored bit for bit in SQLite's signed integer and read back the same way
		}
	}
	return 0
}

// refundNotice tells how much more of a payment has gone back since the last
// notice. Providers report a refund more than once (Stripe's refund and its
// charge's running total), so what is compared is the payment's total refunded
// so far, the way the reports count it, never the events.
func (s *Service) refundNotice(ctx context.Context, tx *sql.Tx, sc ledger.Scope, raw string, at int64) (n Notice, ok bool, err error) {
	var pid, cur string
	var gross int64
	err = tx.QueryRowContext(ctx, `SELECT id, currency, gross FROM pay_payments WHERE site_id = ?1 AND provider = ?2 AND test = 0
		AND (id = ?3 OR id IN (SELECT payment_id FROM pay_aliases WHERE site_id = ?1 AND provider = ?2 AND alias = ?3))`, sc.Site, sc.Provider, raw).
		Scan(&pid, &cur, &gross)
	if err == sql.ErrNoRows {
		return n, false, nil
	}
	if err != nil {
		return n, false, err
	}
	var sum, cum int64
	err = tx.QueryRowContext(ctx, `SELECT coalesce(sum(CASE WHEN cumulative = 0 THEN amount END), 0), coalesce(max(CASE WHEN cumulative = 1 THEN amount END), 0)
		FROM pay_refunds WHERE site_id = ?1 AND provider = ?2 AND status = 'succeeded'
		AND (payment_id = ?3 OR payment_id IN (SELECT alias FROM pay_aliases WHERE site_id = ?1 AND provider = ?2 AND payment_id = ?3))`, sc.Site, sc.Provider, pid).Scan(&sum, &cum)
	if err != nil {
		return n, false, err
	}
	total := min(max(sum, cum), gross)
	var told int64
	if err := tx.QueryRowContext(ctx, `SELECT amount FROM pay_notices WHERE site_id = ? AND provider = ? AND id = ?`, sc.Site, sc.Provider, "refund:"+pid).Scan(&told); err != nil && err != sql.ErrNoRows {
		return n, false, err
	}
	if total <= told {
		return n, false, nil
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO pay_notices (site_id, provider, id, kind, amount, at) VALUES (?1, ?2, ?3, 'refund', ?4, ?5)
		ON CONFLICT (site_id, provider, id) DO UPDATE SET amount = excluded.amount, at = excluded.at`, sc.Site, sc.Provider, "refund:"+pid, total, at); err != nil {
		return n, false, err
	}
	late, history := s.age(at)
	cur = strings.ToUpper(cur)
	back := ledger.RoundDiv(total-told, payments.AmountScale(sc.Provider, cur))
	if history || back <= 0 {
		return n, false, nil
	}
	return Notice{At: at, Kind: NoticeRefund, Amount: back, Currency: cur, Exponent: fx.Exponent(cur), Late: late}, true, nil
}
