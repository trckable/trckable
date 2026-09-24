// Package ledger stores money facts in SQLite, the source of truth for
// revenue. Writes are idempotent, versioned upserts (newer event wins, empty
// fields never erase known ones), so webhooks can arrive late, twice or out
// of order, and the whole ledger can be rebuilt from the inbox at any time.
package ledger

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/fx"
	"github.com/trckable/trckable/server/internal/payments"
)

// Scope says where an event's facts belong.
type Scope struct {
	Site       string
	Provider   string
	Connection string
	Test       bool   // the connection is a sandbox/test connection
	EmailKey   []byte // keyed hashing for customer emails (secrets.Box.Derive)
}

// Apply writes one normalised event inside tx.
func Apply(ctx context.Context, tx *sql.Tx, sc Scope, ev payments.Event) error {
	test := sc.Test || ev.Test
	v := ev.At
	if v == 0 {
		v = time.Now().UnixMilli()
	}
	for _, p := range ev.Payments {
		cur := strings.ToUpper(p.Currency)
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO pay_payments (site_id, provider, id, connection_id, test, paid_at, currency, gross, tax,
			                          customer_id, subscription_id, email_hash, visitor_id, kind, version)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (site_id, provider, id) DO UPDATE SET
				test            = excluded.test OR test,
				paid_at         = CASE WHEN excluded.version >= version THEN excluded.paid_at ELSE paid_at END,
				currency        = CASE WHEN excluded.version >= version THEN excluded.currency ELSE currency END,
				gross           = CASE WHEN excluded.version >= version THEN excluded.gross ELSE gross END,
				tax             = CASE WHEN excluded.tax IS NOT NULL AND (excluded.version >= version OR tax IS NULL) THEN excluded.tax ELSE tax END,
				customer_id     = CASE WHEN excluded.customer_id <> '' AND (excluded.version >= version OR customer_id = '') THEN excluded.customer_id ELSE customer_id END,
				subscription_id = CASE WHEN excluded.subscription_id <> '' AND (excluded.version >= version OR subscription_id = '') THEN excluded.subscription_id ELSE subscription_id END,
				email_hash      = CASE WHEN excluded.email_hash <> '' AND (excluded.version >= version OR email_hash = '') THEN excluded.email_hash ELSE email_hash END,
				visitor_id      = CASE WHEN excluded.visitor_id <> 0 AND (excluded.version >= version OR visitor_id = 0) THEN excluded.visitor_id ELSE visitor_id END,
				kind            = CASE WHEN excluded.version >= version THEN excluded.kind ELSE kind END,
				version         = max(version, excluded.version)`,
			sc.Site, sc.Provider, p.ID, sc.Connection, test, p.PaidAt, cur, p.Gross, p.Tax,
			p.CustomerID, p.SubscriptionID, emailHash(sc.EmailKey, p.Email), int64(p.Visitor), kindOr(p.Kind), v); err != nil {
			return err
		}
	}
	for _, h := range ev.Hints {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO pay_hints (site_id, provider, payment_id, source, tax, visitor_id, customer_id, subscription_id, kind, version)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (site_id, provider, payment_id, source) DO UPDATE SET
				tax             = coalesce(CASE WHEN excluded.version >= version THEN excluded.tax END, tax, excluded.tax),
				visitor_id      = CASE WHEN excluded.visitor_id <> 0 THEN excluded.visitor_id ELSE visitor_id END,
				customer_id     = CASE WHEN excluded.customer_id <> '' THEN excluded.customer_id ELSE customer_id END,
				subscription_id = CASE WHEN excluded.subscription_id <> '' THEN excluded.subscription_id ELSE subscription_id END,
				kind            = CASE WHEN excluded.kind <> '' THEN excluded.kind ELSE kind END,
				version         = max(version, excluded.version)`,
			sc.Site, sc.Provider, h.PaymentID, h.Source, h.Tax, int64(h.Visitor), h.CustomerID, h.SubscriptionID, h.Kind, v); err != nil {
			return err
		}
	}
	for _, r := range ev.Refunds {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO pay_refunds (site_id, provider, id, payment_id, amount, currency, status, cumulative, at, version)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (site_id, provider, id) DO UPDATE SET
				payment_id = CASE WHEN excluded.payment_id <> '' THEN excluded.payment_id ELSE payment_id END,
				amount     = CASE WHEN excluded.version >= version THEN excluded.amount ELSE amount END,
				currency   = CASE WHEN excluded.version >= version THEN excluded.currency ELSE currency END,
				status     = CASE WHEN excluded.version >= version THEN excluded.status ELSE status END,
				at         = CASE WHEN excluded.version >= version THEN excluded.at ELSE at END,
				version    = max(version, excluded.version)`,
			sc.Site, sc.Provider, r.ID, r.PaymentID, r.Amount, strings.ToUpper(r.Currency), r.Status, r.Cumulative, r.At, v); err != nil {
			return err
		}
	}
	for _, d := range ev.Disputes {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO pay_disputes (site_id, provider, id, payment_id, amount, currency, status, at, version)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (site_id, provider, id) DO UPDATE SET
				payment_id = CASE WHEN excluded.payment_id <> '' THEN excluded.payment_id ELSE payment_id END,
				amount     = CASE WHEN excluded.version >= version THEN excluded.amount ELSE amount END,
				status     = CASE WHEN excluded.version >= version THEN excluded.status ELSE status END,
				at         = CASE WHEN excluded.version >= version THEN excluded.at ELSE at END,
				version    = max(version, excluded.version)`,
			sc.Site, sc.Provider, d.ID, d.PaymentID, d.Amount, strings.ToUpper(d.Currency), d.Status, d.At, v); err != nil {
			return err
		}
	}
	for _, a := range ev.Aliases {
		if _, err := tx.ExecContext(ctx, `INSERT OR REPLACE INTO pay_aliases (site_id, provider, alias, payment_id) VALUES (?, ?, ?, ?)`,
			sc.Site, sc.Provider, a.Alias, a.PaymentID); err != nil {
			return err
		}
	}
	for _, l := range ev.Links {
		// The earliest event wins: renewals follow the visitor who started it.
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO pay_links (site_id, provider, kind, key, visitor_id, version) VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT (site_id, provider, kind, key) DO UPDATE SET
				visitor_id = CASE WHEN excluded.version < version THEN excluded.visitor_id ELSE visitor_id END,
				version    = min(version, excluded.version)`,
			sc.Site, sc.Provider, l.Kind, l.Key, int64(l.Visitor), v); err != nil {
			return err
		}
	}
	return nil
}

func kindOr(k string) string {
	if k == "" {
		return payments.KindOneTime
	}
	return k
}

// EmailHash is emailHash, for the one caller outside this package: answering
// a data request means finding the same hash from the address given.
func EmailHash(key []byte, e string) string { return emailHash(key, e) }

// emailHash keys the hash with the instance secret: emails are low-entropy,
// so an unkeyed hash of a stolen database could be brute-forced.
func emailHash(key []byte, e string) string {
	e = strings.ToLower(strings.TrimSpace(e))
	if e == "" {
		return ""
	}
	if len(key) == 0 {
		key = []byte("trckable email v1") // tests and rebuilds without a box
	}
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(e))
	return hex.EncodeToString(mac.Sum(nil)[:16])
}

// Fact is one payment as reports use it, in the site's currency.
type Fact struct {
	Provider  string
	ID        string
	PaidAt    time.Time
	Amount    int64 // net revenue: paid minus tax, site currency minor units
	Refunded  int64 // refunds and lost disputes, net of tax, site currency minor units
	Visitor   uint64
	Customer  string // stable per-customer key (provider customer, email hash, or payment)
	Kind      string
	Converted bool      // false: no FX rate yet (excluded from sums until one arrives)
	TouchAt   time.Time // when the attribution window ends: paid_at, or the subscription's first payment for renewals
}

// Facts returns the site's payments paid in [from, to), converted into the
// site currency. Test/sandbox payments are included only when test is true.
//
// It reads the payments in range plus only their related rows (hints,
// aliases, refunds, disputes, links, sibling subscription payments) with
// indexed batch queries, then resolves each fact in Go: a few milliseconds
// for thousands of payments, and no correlated per-payment SQL.
func Facts(ctx context.Context, db *sql.DB, rates *fx.Rates, site, currency string, from, to time.Time, test bool) ([]Fact, error) {
	type pay struct {
		provider, id, cur, customer, sub, email, kind string
		paid, gross                                   int64
		tax                                           sql.NullInt64
		visitor                                       int64
		test                                          bool
	}
	key := func(provider, id string) string { return provider + "\x00" + id }
	rows, err := db.QueryContext(ctx, `SELECT provider, id, paid_at, currency, gross, tax, customer_id, subscription_id, email_hash, visitor_id, kind, test
		FROM pay_payments WHERE site_id = ? AND paid_at >= ? AND paid_at < ? AND (test = 0 OR ?) ORDER BY paid_at, provider, id`,
		site, from.UnixMilli(), to.UnixMilli(), test)
	if err != nil {
		return nil, err
	}
	var ps []pay
	for rows.Next() {
		var p pay
		if err := rows.Scan(&p.provider, &p.id, &p.paid, &p.cur, &p.gross, &p.tax, &p.customer, &p.sub, &p.email, &p.visitor, &p.kind, &p.test); err != nil {
			rows.Close()
			return nil, err
		}
		if !test && p.test {
			continue
		}
		ps = append(ps, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil || len(ps) == 0 {
		return nil, err
	}

	// Every id each payment is known by (its own + aliases).
	ids := make([]string, 0, len(ps))
	for _, p := range ps {
		ids = append(ids, p.id)
	}
	owner := map[string]string{} // provider\0key -> payment id
	for _, p := range ps {
		owner[key(p.provider, p.id)] = p.id
	}
	if err := each(ctx, db, `SELECT provider, alias, payment_id FROM pay_aliases WHERE site_id = ? AND payment_id IN (SELECT value FROM json_each(?))`,
		[]any{site, jsonList(ids)}, func(r *sql.Rows) error {
			var prov, alias, pid string
			if err := r.Scan(&prov, &alias, &pid); err != nil {
				return err
			}
			owner[key(prov, alias)] = pid
			return nil
		}); err != nil {
		return nil, err
	}
	keys := make([]string, 0, len(owner))
	for k := range owner {
		keys = append(keys, k[strings.IndexByte(k, 0)+1:])
	}

	// Hints (tax, visitor, customer, subscription, kind), newest tax wins.
	type hint struct {
		tax                 sql.NullInt64
		taxV                int64
		visitor             int64
		customer, sub, kind string
	}
	hints := map[string]*hint{} // provider\0payment id
	if err := each(ctx, db, `SELECT provider, payment_id, tax, visitor_id, customer_id, subscription_id, kind, version FROM pay_hints
		WHERE site_id = ? AND payment_id IN (SELECT value FROM json_each(?))`, []any{site, jsonList(keys)}, func(r *sql.Rows) error {
		var prov, k, cus, sub, kind string
		var tax sql.NullInt64
		var vis, ver int64
		if err := r.Scan(&prov, &k, &tax, &vis, &cus, &sub, &kind, &ver); err != nil {
			return err
		}
		pid, ok := owner[key(prov, k)]
		if !ok {
			return nil
		}
		h := hints[key(prov, pid)]
		if h == nil {
			h = &hint{}
			hints[key(prov, pid)] = h
		}
		if tax.Valid && (!h.tax.Valid || ver >= h.taxV) {
			h.tax, h.taxV = tax, ver
		}
		h.visitor, h.customer, h.sub, h.kind = maxI(h.visitor, vis), maxS(h.customer, cus), maxS(h.sub, sub), maxS(h.kind, kind)
		return nil
	}); err != nil {
		return nil, err
	}

	// Refunds (per refund and cumulative) and lost disputes.
	sumRef, cumRef, lost := map[string]int64{}, map[string]int64{}, map[string]int64{}
	if err := each(ctx, db, `SELECT provider, payment_id, amount, cumulative FROM pay_refunds
		WHERE site_id = ? AND status = 'succeeded' AND payment_id IN (SELECT value FROM json_each(?))`, []any{site, jsonList(keys)}, func(r *sql.Rows) error {
		var prov, k string
		var amt int64
		var cum bool
		if err := r.Scan(&prov, &k, &amt, &cum); err != nil {
			return err
		}
		if pid, ok := owner[key(prov, k)]; ok {
			if cum {
				cumRef[key(prov, pid)] = max(cumRef[key(prov, pid)], amt)
			} else {
				sumRef[key(prov, pid)] += amt
			}
		}
		return nil
	}); err != nil {
		return nil, err
	}
	if err := each(ctx, db, `SELECT provider, payment_id, amount FROM pay_disputes
		WHERE site_id = ? AND status = 'lost' AND payment_id IN (SELECT value FROM json_each(?))`, []any{site, jsonList(keys)}, func(r *sql.Rows) error {
		var prov, k string
		var amt int64
		if err := r.Scan(&prov, &k, &amt); err != nil {
			return err
		}
		if pid, ok := owner[key(prov, k)]; ok {
			lost[key(prov, pid)] += amt
		}
		return nil
	}); err != nil {
		return nil, err
	}

	// Resolve subscription and customer per payment, then their links.
	subOf := func(p pay) string {
		if p.sub != "" {
			return p.sub
		}
		if h := hints[key(p.provider, p.id)]; h != nil {
			return h.sub
		}
		return ""
	}
	cusOf := func(p pay) string {
		if p.customer != "" {
			return p.customer
		}
		if h := hints[key(p.provider, p.id)]; h != nil {
			return h.customer
		}
		return ""
	}
	var linkKeys, subs []string
	for _, p := range ps {
		if s := subOf(p); s != "" {
			linkKeys, subs = append(linkKeys, s), append(subs, s)
		}
		if c := cusOf(p); c != "" {
			linkKeys = append(linkKeys, c)
		}
	}
	link := map[string]int64{} // provider\0kind\0key -> visitor
	if err := each(ctx, db, `SELECT provider, kind, key, visitor_id FROM pay_links WHERE site_id = ? AND key IN (SELECT value FROM json_each(?))`,
		[]any{site, jsonList(linkKeys)}, func(r *sql.Rows) error {
			var prov, kind, k string
			var v int64
			if err := r.Scan(&prov, &kind, &k, &v); err != nil {
				return err
			}
			link[prov+"\x00"+kind+"\x00"+k] = v
			return nil
		}); err != nil {
		return nil, err
	}

	// The first payment of each subscription (any time, same test flag):
	// payments naming it directly, or through a hint on the payment or its alias.
	type first struct {
		at int64
		id string
	}
	firsts := map[string]first{} // provider\0test\0sub
	note := func(prov string, t bool, sub string, at int64, id string) {
		k := prov + "\x00" + fmt.Sprint(t) + "\x00" + sub
		if f, ok := firsts[k]; !ok || at < f.at || (at == f.at && id < f.id) {
			firsts[k] = first{at, id}
		}
	}
	if len(subs) > 0 {
		if err := each(ctx, db, `
			SELECT p.provider, p.test, p.paid_at, p.id, coalesce(nullif(p.subscription_id, ''), h.subscription_id)
			FROM pay_payments p
			LEFT JOIN pay_aliases a ON a.site_id = p.site_id AND a.provider = p.provider AND a.payment_id = p.id
			LEFT JOIN pay_hints h ON h.site_id = p.site_id AND h.provider = p.provider AND h.payment_id IN (p.id, a.alias) AND h.subscription_id <> ''
			WHERE p.site_id = ?1 AND (p.subscription_id IN (SELECT value FROM json_each(?2)) OR h.subscription_id IN (SELECT value FROM json_each(?2)))`,
			[]any{site, jsonList(subs)}, func(r *sql.Rows) error {
				var prov, id, sub string
				var t bool
				var at int64
				if err := r.Scan(&prov, &t, &at, &id, &sub); err != nil {
					return err
				}
				note(prov, t, sub, at, id)
				return nil
			}); err != nil {
			return nil, err
		}
	}

	out := make([]Fact, 0, len(ps))
	for _, p := range ps {
		k := key(p.provider, p.id)
		h := hints[k]
		if h == nil {
			h = &hint{}
		}
		tax := int64(0)
		switch {
		case p.tax.Valid:
			tax = p.tax.Int64
		case h.tax.Valid:
			tax = h.tax.Int64
		}
		sub, cus := subOf(p), cusOf(p)
		vis := p.visitor
		if vis == 0 {
			vis = h.visitor
		}
		if vis == 0 && sub != "" {
			vis = link[p.provider+"\x00sub\x00"+sub]
		}
		if vis == 0 && cus != "" {
			vis = link[p.provider+"\x00cus\x00"+cus]
		}
		kind := p.kind
		switch {
		case sub != "":
			kind = KindSubscriptionOrRenewal(firsts[p.provider+"\x00"+fmt.Sprint(p.test)+"\x00"+sub], p.paid, p.id)
		case p.kind == "one_time" && h.kind != "":
			kind = h.kind
		}
		custKey := cus
		if custKey == "" {
			custKey = p.email
		}
		if custKey == "" {
			custKey = p.id
		}
		back := max(sumRef[k], cumRef[k]) + lost[k]
		f := Fact{Provider: p.provider, ID: p.id, PaidAt: time.UnixMilli(p.paid).UTC(), Visitor: uint64(vis), Customer: p.provider + ":" + custKey, Kind: kind}
		f.TouchAt = f.PaidAt
		if kind == payments.KindRenewal {
			// A renewal is earned by the visit that started the subscription.
			if fs, ok := firsts[p.provider+"\x00"+fmt.Sprint(p.test)+"\x00"+sub]; ok {
				f.TouchAt = time.UnixMilli(fs.at).UTC()
			}
		}
		net := max(p.gross-tax, 0)
		back = min(back, p.gross)
		backNet := back // refunds include tax: remove the same share of tax
		if p.gross > 0 {
			backNet = int64(float64(back) * float64(net) / float64(p.gross))
		}
		day := f.PaidAt.Format("2006-01-02")
		a, ok1 := rates.Convert(ctx, net, p.cur, currency, day)
		b, ok2 := rates.Convert(ctx, backNet, p.cur, currency, day)
		f.Amount, f.Refunded, f.Converted = a, b, ok1 && ok2
		out = append(out, f)
	}
	return out, nil
}

// KindSubscriptionOrRenewal: the first payment of a subscription (also after
// a trial) is "subscription", every later one "renewal".
func KindSubscriptionOrRenewal(first struct {
	at int64
	id string
}, at int64, id string) string {
	if first.id == "" || (at == first.at && id == first.id) || at < first.at || (at == first.at && id < first.id) {
		return payments.KindSubscription
	}
	return payments.KindRenewal
}

func each(ctx context.Context, db *sql.DB, q string, args []any, f func(*sql.Rows) error) error {
	rows, err := db.QueryContext(ctx, q, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		if err := f(rows); err != nil {
			return err
		}
	}
	return rows.Err()
}

func jsonList(v []string) string {
	if len(v) == 0 {
		return "[]"
	}
	b, _ := json.Marshal(v)
	return string(b)
}

func maxI(a, b int64) int64 {
	if b > a {
		return b
	}
	return a
}

func maxS(a, b string) string {
	if b > a {
		return b
	}
	return a
}

// Reset deletes a site's derived ledger rows (the inbox stays) so it can be
// rebuilt with `trckabled payments reprocess`.
//
// Payments of someone erased through a data request are the exception: their
// raw notices were deleted from the inbox with them, so a rebuild could not
// bring the money back. Those rows, already unlinked, stay as they are, with
// their refunds and disputes.
func Reset(ctx context.Context, tx *sql.Tx, site string) error {
	const erased = ` AND provider || ':' || %s NOT IN (SELECT value FROM pay_erased WHERE site_id = ? AND kind = 'payment')`
	keep := map[string]string{"pay_payments": "id", "pay_refunds": "payment_id", "pay_disputes": "payment_id"}
	for _, t := range []string{"pay_payments", "pay_hints", "pay_refunds", "pay_disputes", "pay_links", "pay_aliases"} {
		q, args := `DELETE FROM `+t+` WHERE site_id = ?`, []any{site}
		if col, ok := keep[t]; ok {
			q, args = q+fmt.Sprintf(erased, col), append(args, site)
		}
		if _, err := tx.ExecContext(ctx, q, args...); err != nil {
			return err
		}
	}
	return nil
}
