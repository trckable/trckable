package ledger

import (
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"strconv"
	"time"
)

// Refund is money paid back, in the site currency: when it went back, how
// much (net of tax, like every sum), and what the sale was. ID only tells two rows apart:
// never the provider's id, a name or an email.
type Refund struct {
	ID      string    `json:"id"`
	At      time.Time `json:"at"`
	Amount  int64     `json:"amount"`
	Kind    string    `json:"kind"`
	Country string    `json:"country,omitempty"`
}

// RefundsIn lists the money paid back in [from, to), one row per refund or
// lost dispute at its own time and amount, newest first. It is read off the
// same facts the revenue sums use, so the rows add up to what they refund (a refund that failed after it was counted is a negative row); a
// payment with no rate yet (nothing converted) has none.
func RefundsIn(site string, facts []Fact, from, to time.Time) []Refund {
	var out []Refund
	for _, f := range facts {
		for _, r := range f.Refunds {
			if r.Amount == 0 || r.At.Before(from) || !r.At.Before(to) {
				continue
			}
			sum := sha256.Sum256([]byte(site + "\x00" + f.Provider + "\x00" + f.ID + "\x00" + strconv.FormatInt(r.At.UnixMilli(), 10)))
			out = append(out, Refund{ID: hex.EncodeToString(sum[:6]), At: r.At, Amount: r.Amount, Kind: f.Kind, Country: f.Country})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if !out[i].At.Equal(out[j].At) {
			return out[i].At.After(out[j].At)
		}
		return out[i].ID < out[j].ID
	})
	return out
}

// CountRefunds is how many refunds the rows are: a reversal (a negative row)
// changes the amount, never the count.
func CountRefunds(rows []Refund) int {
	n := 0
	for _, r := range rows {
		if r.Amount > 0 {
			n++
		}
	}
	return n
}
