package revenue

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
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
	return uint64(id), err //nolint:gosec // visitor ids are stored bit for bit as SQLite's signed int64; the round trip is lossless
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
		site, int64(visitor)) //nolint:gosec // visitor ids are stored bit for bit as SQLite's signed int64; the round trip is lossless
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
		p.PaidAt, p.Test = time.UnixMilli(at).UTC(), test == 1 // paid_at is unix ms
		scale := payments.AmountScale(p.Provider, p.Currency)
		p.Gross, p.Tax = ledger.RoundDiv(p.Gross, scale), ledger.RoundDiv(p.Tax, scale)
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
		site, int64(visitor), hash) //nolint:gosec // visitor ids are stored bit for bit as SQLite's signed int64; the round trip is lossless
	if err != nil {
		return 0, 0, err
	}
	var mine []payRef
	for rows.Next() {
		var p payRef
		if err := rows.Scan(&p.provider, &p.id, &p.hash); err != nil {
			rows.Close()
			return 0, 0, err
		}
		mine = append(mine, p)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, 0, err
	}
	rows.Close()
	seen := map[string]bool{}
	for _, p := range mine {
		seen[p.provider+":"+p.id] = true
	}
	if visitor != 0 {
		// Hints are where a visitor id arrives from, so they go too.
		if _, err := tx.ExecContext(ctx, `UPDATE pay_hints SET visitor_id = 0 WHERE site_id = ? AND visitor_id = ?`, site, int64(visitor)); err != nil { //nolint:gosec // visitor ids are stored bit for bit as SQLite's signed int64; the round trip is lossless
			return 0, 0, err
		}
		// Their customer and subscription links credit renewals to them: the
		// links are remembered (as ids, never the person) and removed, so a
		// later payment by the same customer is not linked back.
		lrows, err := tx.QueryContext(ctx, `SELECT provider, kind, key FROM pay_links WHERE site_id = ? AND visitor_id = ?`, site, int64(visitor)) //nolint:gosec // visitor ids are stored bit for bit
		if err != nil {
			return 0, 0, err
		}
		type link struct{ provider, kind, key string }
		var links []link
		for lrows.Next() {
			var l link
			if err := lrows.Scan(&l.provider, &l.kind, &l.key); err != nil {
				lrows.Close()
				return 0, 0, err
			}
			links = append(links, l)
		}
		if err := lrows.Err(); err != nil {
			lrows.Close()
			return 0, 0, err
		}
		lrows.Close()
		for _, l := range links {
			if err := remember("link", l.provider+":"+l.kind+":"+l.key); err != nil {
				return 0, 0, err
			}
			// The payments those links credit to them (renewals, later
			// purchases) are theirs too, and so are their raw notices.
			col := "customer_id"
			if l.kind == "sub" {
				col = "subscription_id"
			}
			more, err := linkedPayments(ctx, tx, site, l.provider, col, l.key)
			if err != nil {
				return 0, 0, err
			}
			for _, p := range more {
				if !seen[p.provider+":"+p.id] {
					seen[p.provider+":"+p.id] = true
					mine = append(mine, p)
				}
			}
		}
	}
	for _, p := range mine {
		if err := remember("payment", p.provider+":"+p.id); err != nil {
			return 0, 0, err
		}
		if err := remember("email", p.hash); err != nil {
			return 0, 0, err
		}
	}
	if unlinked, err = forgetErased(ctx, tx, site); err != nil {
		return 0, 0, err
	}
	ids := make([]string, 0, len(mine))
	for _, p := range mine {
		ids = append(ids, p.provider+":"+p.id)
	}
	if dropped, err = dropNotices(ctx, tx, site, ids, visitor, email); err != nil {
		return 0, 0, err
	}
	return unlinked, dropped, tx.Commit()
}

// payRef is one payment in the ledger and the keyed hash of its email.
type payRef struct{ provider, id, hash string }

// linkedPayments lists the payments of one customer or subscription: named
// on the payment itself, or through a hint on it or on one of its aliases.
func linkedPayments(ctx context.Context, tx *sql.Tx, site, provider, col, key string) ([]payRef, error) {
	if col != "customer_id" && col != "subscription_id" { // col is spliced into the SQL below
		return nil, fmt.Errorf("linkedPayments: unexpected column %q", col)
	}
	//nolint:gosec // col is one of two column names, checked above; the values are bound
	rows, err := tx.QueryContext(ctx, `
		SELECT p.provider, p.id, p.email_hash FROM pay_payments p
		WHERE p.site_id = ?1 AND p.provider = ?2 AND (p.`+col+` = ?3 OR EXISTS (
			SELECT 1 FROM pay_hints h
			WHERE h.site_id = p.site_id AND h.provider = p.provider AND h.`+col+` = ?3
			  AND (h.payment_id = p.id OR h.payment_id IN (SELECT alias FROM pay_aliases a WHERE a.site_id = p.site_id AND a.provider = p.provider AND a.payment_id = p.id))))`,
		site, provider, key)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []payRef
	for rows.Next() {
		var p payRef
		if err := rows.Scan(&p.provider, &p.id, &p.hash); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// dropNotices deletes the raw provider notices about an erased person: every
// processed inbox body that names one of their payments (or an alias of
// one), links their visitor, or contains their address. The ledger's ids are
// not always the provider's (Lemon Squeezy's order 101 is "order:101"), so
// candidates are found by the provider's own id and confirmed by parsing
// the body, never by a bare substring that could hit someone else's notice.
func dropNotices(ctx context.Context, tx *sql.Tx, site string, ids []string, visitor uint64, email string) (int64, error) {
	theirs := map[string]bool{} // provider:payment id or alias
	var needles []string
	for _, id := range ids {
		theirs[id] = true
	}
	arows, err := tx.QueryContext(ctx, `SELECT provider || ':' || alias FROM pay_aliases WHERE site_id = ? AND provider || ':' || payment_id IN (SELECT value FROM json_each(?))`,
		site, jsonList(ids))
	if err != nil {
		return 0, err
	}
	for arows.Next() {
		var a string
		if err := arows.Scan(&a); err != nil {
			arows.Close()
			return 0, err
		}
		theirs[a] = true
	}
	arows.Close()
	for id := range theirs {
		_, raw, _ := strings.Cut(id, ":") // drop the provider
		if _, rest, ok := strings.Cut(raw, ":"); ok && (strings.HasPrefix(raw, "order:") || strings.HasPrefix(raw, "sinv:")) {
			raw = rest // Lemon Squeezy's own id
		}
		needles = append(needles, strings.ToLower(raw))
	}
	if visitor != 0 { // checkout metadata carries the visitor id in base 36
		needles = append(needles, strconv.FormatUint(visitor, 36))
	}
	if e := emailToken(email); e != "" {
		needles = append(needles, e)
	}
	type notice struct {
		provider string
		body     []byte
	}
	found := map[int64]notice{}
	for _, n := range needles {
		rows, err := tx.QueryContext(ctx, `SELECT i.id, c.provider, i.body FROM pay_inbox i JOIN pay_connections c ON c.id = i.connection_id
			WHERE c.site_id = ? AND i.processed_at IS NOT NULL AND instr(lower(CAST(i.body AS TEXT)), ?) > 0`, site, n)
		if err != nil {
			return 0, err
		}
		for rows.Next() {
			var id int64
			var nt notice
			if err := rows.Scan(&id, &nt.provider, &nt.body); err != nil {
				rows.Close()
				return 0, err
			}
			found[id] = nt
		}
		rows.Close()
	}
	var dropped int64
	for id, nt := range found {
		if !aboutThem(nt.provider, nt.body, theirs, visitor, email) {
			continue
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM pay_inbox WHERE id = ?`, id); err != nil {
			return dropped, err
		}
		dropped++
	}
	return dropped, nil
}

// emailToken is an address as a whole JSON string value, quotes included, so
// erasing bob@x.com never matches "jimbob@x.com" in someone else's notice.
func emailToken(email string) string {
	e := strings.ToLower(strings.TrimSpace(email))
	if e == "" {
		return ""
	}
	return `"` + e + `"`
}

// aboutThem reports whether a raw notice concerns the erased person.
func aboutThem(provider string, body []byte, theirs map[string]bool, visitor uint64, email string) bool {
	if e := emailToken(email); e != "" && strings.Contains(strings.ToLower(string(body)), e) {
		return true
	}
	p := payments.Registry[provider]
	if p == nil {
		return false
	}
	ev, err := p.Parse(body)
	if err != nil {
		return false
	}
	is := func(id string) bool { return id != "" && theirs[provider+":"+id] }
	for _, x := range ev.Payments {
		if is(x.ID) || (visitor != 0 && x.Visitor == visitor) {
			return true
		}
	}
	for _, x := range ev.Hints {
		if is(x.PaymentID) || (visitor != 0 && x.Visitor == visitor) {
			return true
		}
	}
	for _, x := range ev.Refunds {
		if is(x.PaymentID) {
			return true
		}
	}
	for _, x := range ev.Disputes {
		if is(x.PaymentID) {
			return true
		}
	}
	for _, x := range ev.Aliases {
		if is(x.Alias) || is(x.PaymentID) {
			return true
		}
	}
	for _, x := range ev.Links {
		if visitor != 0 && x.Visitor == visitor {
			return true
		}
	}
	return false
}

func jsonList(v []string) string {
	b, _ := json.Marshal(append([]string{}, v...))
	return string(b)
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
