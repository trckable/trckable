package query

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/fx"
	"github.com/trckable/trckable/server/internal/ledger"
)

// MaxPayOffset is how deep into a list a page may start.
const MaxPayOffset = 10000

// MaxPayPage is the most rows a page holds.
const MaxPayPage = 50

// PayPage is one page of the payment list or of the customer list, with how
// many there are in all and the currency the amounts are in.
type PayPage struct {
	Payments  []PayRow
	Customers []CustRow
	Total     int
	Countries []CountryRev
	Currency  string
	Exponent  int
}

// PayList reads one page of the period's payments (newest first) or paying
// customers (biggest spender first), credited the way the report credits them
// (its attribution, its filters, test payments when asked for). It reads only
// the payments and the visits of those who paid: no KPIs, no breakdowns, no
// chart, so a page costs a fraction of a report. offset is capped at
// MaxPayOffset and the page at MaxPayPage.
func (q Q) PayList(ctx context.Context, p Params, customers bool, limit, offset int) (*PayPage, error) {
	out, err := q.payList(ctx, p, customers, limit, offset)
	if err != nil && isOutOfMemory(err) {
		out, err = q.payList(ctx, p, customers, limit, offset)
	}
	return out, err
}

func (q Q) payList(ctx context.Context, p Params, customers bool, limit, offset int) (*PayPage, error) {
	if limit <= 0 || limit > MaxPayPage {
		limit = MaxPayPage
	}
	if offset < 0 {
		offset = 0
	}
	if offset > MaxPayOffset {
		offset = MaxPayOffset
	}
	if p.TZ == "" {
		p.TZ = "UTC"
	}
	cur := p.Currency
	if cur == "" {
		cur = "USD"
	}
	out := &PayPage{Currency: cur, Exponent: fx.Exponent(cur)}
	if err := acquireReport(ctx); err != nil {
		return nil, err
	}
	defer releaseReport()
	facts, enabled, err := q.Payments(ctx, p.Site, cur, p.From, p.To, p.Test)
	if err != nil || !enabled || len(facts) == 0 {
		return out, err
	}
	conn, err := q.DB.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	if err := q.loadOpen(ctx, conn, p.Site); err != nil {
		return nil, err
	}
	defer func() {
		_, _ = conn.ExecContext(context.Background(), `DROP TABLE IF EXISTS s_open`)
		_, _ = conn.ExecContext(context.Background(), `DROP TABLE IF EXISTS p_facts`)
	}()
	if err := loadFacts(ctx, conn, facts); err != nil {
		return nil, err
	}
	cte, cteArgs, err := sessionsCTE(p)
	if err != nil {
		return nil, err
	}
	sqlText, args, _, err := attributedSQL(p, facts, cte, cteArgs)
	if err != nil {
		return nil, err
	}
	if out.Countries, err = countryRevenue(ctx, conn, sqlText, args); err != nil {
		return nil, err
	}
	if customers {
		out.Customers, out.Total, err = custList(ctx, conn, sqlText, args, p.Site, limit, offset)
	} else {
		out.Payments, out.Total, err = payRows(ctx, conn, sqlText, args, p.Site, cur, facts, limit, offset)
	}
	return out, err
}

// MaxPayCountries is how many named countries the revenue split lists.
const MaxPayCountries = 5

// CountryRev is what one country paid in the period, net of refunds. An empty
// Country is the payments no country is known for.
type CountryRev struct {
	Country string `json:"country"`
	Revenue int64  `json:"revenue"`
}

// countryRevenue splits the period's net revenue by country over every
// payment, linked to a visit or not: the linked visit's country, else the one
// the provider named, else unknown. The biggest MaxPayCountries come first and
// the unknown ones last, only when there is money in them.
func countryRevenue(ctx context.Context, conn *sql.Conn, sqlText string, args []any) ([]CountryRev, error) {
	rows, err := conn.QueryContext(ctx, sqlText+`
		SELECT coalesce(nullif(country, ''), nullif(bill_country, ''), '') AS c, sum(amount - refunded) AS rev
		FROM ar GROUP BY c ORDER BY rev DESC, c`, args...)
	if err != nil {
		return nil, fmt.Errorf("revenue by country: %w", err)
	}
	defer rows.Close()
	out := []CountryRev{}
	var unknown int64
	for rows.Next() {
		var c string
		var rev int64
		if err := rows.Scan(&c, &rev); err != nil {
			return nil, err
		}
		switch {
		case rev <= 0:
		case c == "":
			unknown = rev
		case len(out) < MaxPayCountries:
			out = append(out, CountryRev{Country: c, Revenue: rev})
		}
	}
	if unknown > 0 {
		out = append(out, CountryRev{Revenue: unknown})
	}
	return out, rows.Err()
}

// PayRow is one payment as the Payments list shows it: what it was worth, who
// paid (the visitor's own id, which opens their journey) and the source that
// brought them. Never a name, an email or a customer key.
type PayRow struct {
	ID       string    `json:"id"`
	At       time.Time `json:"at"`
	Amount   int64     `json:"amount"`             // paid, net of tax, minor units
	Refunded int64     `json:"refunded,omitempty"` // paid back, minor units
	Kind     string    `json:"kind"`
	Visitor  string    `json:"visitor,omitempty"` // base 36, as /events and the journey use it; empty when no visit is known
	Channel  string    `json:"channel,omitempty"`
	Referrer string    `json:"referrer,omitempty"`
	Country  string    `json:"country,omitempty"`  // the billing country the provider named, else the country of the linked visit
	Provider string    `json:"provider,omitempty"` // the payment provider's id
	// Currency is what the buyer paid in, only when it is not the site's currency.
	Currency string `json:"currency,omitempty"`
	Product  string    `json:"product,omitempty"` // what was bought, as the provider names it
	Method   string    `json:"method,omitempty"`  // how it was paid: card, paypal, apple_pay, google_pay, bank, crypto or other
	// Name is what the payment provider calls the buyer, set by the API for a
	// payment with no known visit, for people who may see it. Never stored.
	Name string `json:"name,omitempty"`
	// Known says the provider has this buyer as a customer, with or without a name.
	Known bool `json:"known,omitempty"`
	// Customer is the ledger's key for the buyer; it stays on the server.
	Customer string `json:"-"`
}

// CustRow is one paying customer: what they spent in the period, how often, the
// source that first brought them and when they were first seen and last paid.
type CustRow struct {
	ID        string    `json:"id"`
	Spent     int64     `json:"spent"` // net of refunds, minor units
	Orders    int64     `json:"orders"`
	Refunded  int64     `json:"refunded,omitempty"`
	Visitor   string    `json:"visitor,omitempty"`
	Channel   string    `json:"channel,omitempty"`
	Referrer  string    `json:"referrer,omitempty"`
	Country   string    `json:"country,omitempty"`
	FirstSeen time.Time `json:"first_seen"`
	LastOrder time.Time `json:"last_order"`
	Name      string    `json:"name,omitempty"`  // as PayRow.Name
	Known     bool      `json:"known,omitempty"` // as PayRow.Known
	Customer  string    `json:"-"`               // as PayRow.Customer
}

// HashID is the id the lists give a payment or a customer: a hash of the
// site and the key, so the key itself never leaves the server.
func HashID(site, key string) string { return hashID(site, key) }

func hashID(site, key string) string {
	sum := sha256.Sum256([]byte(site + "\x00" + key))
	return hex.EncodeToString(sum[:6])
}

func visitorID(v uint64) string {
	if v == 0 {
		return ""
	}
	return strconv.FormatUint(v, 36)
}

// payRows is a page of the period's payments, newest first, each read the way
// the report credits it (its attribution and filters). A payment with no known
// visit has an amount and a time only.
func payRows(ctx context.Context, conn *sql.Conn, sqlText string, args []any, site, cur string, facts []ledger.Fact, limit, offset int) ([]PayRow, int, error) {
	var total int
	if err := conn.QueryRowContext(ctx, sqlText+` SELECT count(*) FROM ar`, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("payments count: %w", err)
	}
	rows, err := conn.QueryContext(ctx, sqlText+`
		SELECT payment_id, paid_at, amount, refunded, kind, coalesce(nullif(country, ''), nullif(bill_country, ''), ''), product, method, visitor_id, attributed, coalesce(channel, 'Direct'), coalesce(referrer, ''), customer
		FROM ar ORDER BY paid_at DESC, payment_id LIMIT ? OFFSET ?`, append(append([]any{}, args...), limit, offset)...)
	if err != nil {
		return nil, 0, fmt.Errorf("payments: %w", err)
	}
	defer rows.Close()
	byID := make(map[string]ledger.Fact, len(facts))
	for _, f := range facts {
		byID[f.Provider+":"+f.ID] = f
	}
	out := []PayRow{}
	for rows.Next() {
		var pid, kind, country, product, method, ch, ref, cust string
		var at time.Time
		var amount, refunded int64
		var visitor uint64
		var attributed bool
		if err := rows.Scan(&pid, &at, &amount, &refunded, &kind, &country, &product, &method, &visitor, &attributed, &ch, &ref, &cust); err != nil {
			return nil, 0, err
		}
		r := PayRow{ID: hashID(site, pid), At: at.UTC(), Amount: amount, Refunded: refunded, Kind: kind, Visitor: visitorID(visitor), Country: country, Product: product, Method: method, Customer: cust}
		if attributed {
			r.Channel, r.Referrer = ch, ref
		}
		if f, ok := byID[pid]; ok {
			r.Provider = f.Provider
			if f.Currency != "" && !strings.EqualFold(f.Currency, cur) {
				r.Currency = strings.ToUpper(f.Currency)
			}
		}
		out = append(out, r)
	}
	return out, total, rows.Err()
}

// custList is a page of the period's paying customers, the biggest spenders
// first. A customer is the payment provider's own key (or the email hash, or
// the single payment), so a returning buyer is one row; the source and the
// visitor are those of their first payment that a visit is known for.
func custList(ctx context.Context, conn *sql.Conn, sqlText string, args []any, site string, limit, offset int) ([]CustRow, int, error) {
	var total int
	if err := conn.QueryRowContext(ctx, sqlText+` SELECT count(DISTINCT customer) FROM ar`, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("customers count: %w", err)
	}
	rows, err := conn.QueryContext(ctx, sqlText+`, g AS (
			SELECT customer, sum(amount - refunded) AS spent, count(*) AS orders, sum(refunded) AS refunded,
			       min(paid_at) AS first_paid, max(paid_at) AS last_paid,
			       coalesce(arg_min(visitor_id, paid_at) FILTER (visitor_id <> 0), 0) AS visitor,
			       arg_min(coalesce(channel, 'Direct'), paid_at) FILTER (attributed) AS ch,
			       arg_min(coalesce(referrer, ''), paid_at) FILTER (attributed) AS ref,
			       arg_min(coalesce(nullif(bill_country, ''), country), paid_at) FILTER (coalesce(nullif(country, ''), nullif(bill_country, ''), '') <> '') AS country,
			       min(coalesce(first_seen, start)) AS seen
			FROM ar GROUP BY customer)
		SELECT customer, spent, orders, refunded, first_paid, last_paid, visitor, coalesce(ch, ''), coalesce(ref, ''), coalesce(country, ''), seen
		FROM g ORDER BY spent DESC, first_paid, customer LIMIT ? OFFSET ?`, append(append([]any{}, args...), limit, offset)...)
	if err != nil {
		return nil, 0, fmt.Errorf("customers: %w", err)
	}
	defer rows.Close()
	out := []CustRow{}
	for rows.Next() {
		var cust, ch, ref, country string
		var spent, orders, refunded int64
		var first, last time.Time
		var visitor uint64
		var seen sql.NullTime
		if err := rows.Scan(&cust, &spent, &orders, &refunded, &first, &last, &visitor, &ch, &ref, &country, &seen); err != nil {
			return nil, 0, err
		}
		r := CustRow{ID: hashID(site, cust), Spent: spent, Orders: orders, Refunded: refunded, Visitor: visitorID(visitor), Channel: ch, Referrer: ref, Country: country, FirstSeen: first.UTC(), LastOrder: last.UTC(), Customer: cust}
		if seen.Valid && seen.Time.Before(first) {
			r.FirstSeen = seen.Time.UTC()
		}
		out = append(out, r)
	}
	return out, total, rows.Err()
}
