package ledger

import (
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"time"
)

// Refund is one payment that was paid back, in the site currency: when the
// latest refund or lost dispute of it arrived, how much went back (net of
// tax, like every sum), and what the sale was. ID only tells two rows apart:
// never the provider's id, a name or an email.
type Refund struct {
	ID      string    `json:"id"`
	At      time.Time `json:"at"`
	Amount  int64     `json:"amount"`
	Kind    string    `json:"kind"`
	Country string    `json:"country,omitempty"`
}

// RefundsIn lists the payments paid back in [from, to), newest first. It is
// read off the same facts the revenue sums use, so a refund counted there is a
// row here; a payment with no rate yet (nothing converted) has no amount and
// is left out.
func RefundsIn(site string, facts []Fact, from, to time.Time) []Refund {
	var out []Refund
	for _, f := range facts {
		if f.Refunded <= 0 || f.RefundedAt.IsZero() || f.RefundedAt.Before(from) || !f.RefundedAt.Before(to) {
			continue
		}
		sum := sha256.Sum256([]byte(site + "\x00" + f.Provider + "\x00" + f.ID))
		out = append(out, Refund{ID: hex.EncodeToString(sum[:6]), At: f.RefundedAt, Amount: f.Refunded, Kind: f.Kind, Country: f.Country})
	}
	sort.Slice(out, func(i, j int) bool {
		if !out[i].At.Equal(out[j].At) {
			return out[i].At.After(out[j].At)
		}
		return out[i].ID < out[j].ID
	})
	return out
}
