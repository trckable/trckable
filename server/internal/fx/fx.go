// Package fx converts payment amounts into a site's reporting currency with
// ECB euro reference rates, fixed at the payment date (plan §5.4). Rates are
// stored in SQLite; weekends and holidays carry the previous rate forward.
package fx

import (
	"context"
	"database/sql"
	"encoding/xml"
	"fmt"
	"io"
	"math"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// Exponent is the number of minor-unit digits of an ISO 4217 currency.
func Exponent(cur string) int {
	switch strings.ToUpper(cur) {
	case "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF":
		return 0
	case "BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND":
		return 3
	}
	return 2
}

// Rates converts between currencies using stored ECB rates.
type Rates struct {
	DB *sql.DB

	mu     sync.RWMutex
	loaded time.Time
	days   []string                      // sorted
	byDay  map[string]map[string]float64 // day -> currency -> per EUR
}

// Convert converts minor units of `from` into minor units of `to` at the
// rate for `day` (YYYY-MM-DD, carried back to the nearest earlier ECB day).
// ok is false when no rate is known yet.
func (r *Rates) Convert(ctx context.Context, amount int64, from, to, day string) (int64, bool) {
	from, to = strings.ToUpper(from), strings.ToUpper(to)
	if from == to {
		return amount, true
	}
	r.ensure(ctx)
	r.mu.RLock()
	defer r.mu.RUnlock()
	i := sort.SearchStrings(r.days, day+"~") - 1 // last day <= day
	// Walk back over at most 10 calendar days: a stale rate is worse than
	// none (the next fetch fills the gap and the report corrects itself).
	for ; i >= 0 && daysBetween(r.days[i], day) <= 10; i-- {
		m := r.byDay[r.days[i]]
		pf, okF := perEUR(m, from)
		pt, okT := perEUR(m, to)
		if okF && okT {
			major := float64(amount) / math.Pow10(Exponent(from))
			return int64(math.Round(major / pf * pt * math.Pow10(Exponent(to)))), true
		}
	}
	return 0, false
}

func perEUR(m map[string]float64, cur string) (float64, bool) {
	if cur == "EUR" {
		return 1, true
	}
	v, ok := m[cur]
	return v, ok && v > 0
}

func daysBetween(a, b string) int {
	ta, _ := time.Parse("2006-01-02", a)
	tb, _ := time.Parse("2006-01-02", b)
	return int(tb.Sub(ta).Hours() / 24)
}

func (r *Rates) ensure(ctx context.Context) {
	r.mu.RLock()
	fresh := time.Since(r.loaded) < time.Minute
	r.mu.RUnlock()
	if !fresh {
		r.Reload(ctx)
	}
}

// Reload reads all stored rates into memory (a few thousand rows).
func (r *Rates) Reload(ctx context.Context) error {
	rows, err := r.DB.QueryContext(ctx, `SELECT day, currency, per_eur FROM fx_rates`)
	if err != nil {
		return err
	}
	defer rows.Close()
	by := map[string]map[string]float64{}
	for rows.Next() {
		var d, c string
		var v float64
		if err := rows.Scan(&d, &c, &v); err != nil {
			return err
		}
		if by[d] == nil {
			by[d] = map[string]float64{}
		}
		by[d][c] = v
	}
	days := make([]string, 0, len(by))
	for d := range by {
		days = append(days, d)
	}
	sort.Strings(days)
	r.mu.Lock()
	r.byDay, r.days, r.loaded = by, days, time.Now()
	r.mu.Unlock()
	return rows.Err()
}

// Earliest returns the first stored day, or "".
func (r *Rates) Earliest(ctx context.Context) string {
	r.ensure(ctx)
	r.mu.RLock()
	defer r.mu.RUnlock()
	if len(r.days) == 0 {
		return ""
	}
	return r.days[0]
}

// ECB feeds (public reference rates, free to reuse with attribution).
const (
	ECB90d  = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml"
	ECBFull = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml"
)

// Fetch downloads an ECB feed and stores its rates.
func (r *Rates) Fetch(ctx context.Context, client *http.Client, url string) (int, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	req.Header.Set("User-Agent", "trckable (+https://trckable.com)")
	res, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("ecb: %s", res.Status)
	}
	n, err := r.Import(ctx, io.LimitReader(res.Body, 64<<20))
	if err == nil {
		r.Reload(ctx)
	}
	return n, err
}

// Import stores rates from ECB XML (<Cube time=…><Cube currency=… rate=…/>).
func (r *Rates) Import(ctx context.Context, body io.Reader) (int, error) {
	var doc struct {
		Days []struct {
			Time  string `xml:"time,attr"`
			Rates []struct {
				Currency string  `xml:"currency,attr"`
				Rate     float64 `xml:"rate,attr"`
			} `xml:"Cube"`
		} `xml:"Cube>Cube"`
	}
	if err := xml.NewDecoder(body).Decode(&doc); err != nil {
		return 0, fmt.Errorf("ecb xml: %w", err)
	}
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	st, err := tx.PrepareContext(ctx, `INSERT OR REPLACE INTO fx_rates (day, currency, per_eur) VALUES (?, ?, ?)`)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, d := range doc.Days {
		if _, err := time.Parse("2006-01-02", d.Time); err != nil {
			continue
		}
		for _, x := range d.Rates {
			if len(x.Currency) == 3 && x.Rate > 0 {
				if _, err := st.ExecContext(ctx, d.Time, strings.ToUpper(x.Currency), x.Rate); err != nil {
					return n, err
				}
				n++
			}
		}
	}
	return n, tx.Commit()
}
