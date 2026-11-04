package api

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/payments"
	"github.com/trckable/trckable/server/internal/query"
)

// A customer's name and email, and the license keys they hold, are what the
// payment provider says when asked. They are read live (kept in memory for ten
// minutes by the revenue service), never stored, and only a signed-in person
// gets them: an API key goes to scripts and assistants, and the public share
// link serves no payment list at all.

// namesTimeout bounds the provider calls behind one page of names.
const namesTimeout = 8 * time.Second

// maxNames is how many customers of one page are asked for.
const maxNames = 25

// namesParallel is how many customers of one page are asked for at once.
const namesParallel = 5

func hasPerson(r *http.Request) bool { return principalOf(r).user != nil }

// withNames returns page with the provider's name on every row that has no
// known visit. The page itself may be shared through the report cache, so its
// rows are copied, never changed.
func (a *API) withNames(ctx context.Context, site string, page *query.PayPage) *query.PayPage {
	if a.Revenue == nil {
		return page
	}
	want := map[string]bool{}
	for _, p := range page.Payments {
		if p.Visitor == "" && p.Customer != "" {
			want[p.Customer] = true
		}
	}
	for _, c := range page.Customers {
		if c.Visitor == "" && c.Customer != "" {
			want[c.Customer] = true
		}
	}
	if len(want) == 0 {
		return page
	}
	ctx, cancel := context.WithTimeout(ctx, namesTimeout)
	defer cancel()
	names := map[string]*string{}
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, namesParallel)
	asked := 0
	for key := range want {
		if asked++; asked > maxNames {
			break
		}
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			d, ok, err := a.Revenue.Details(ctx, site, key, false)
			if err != nil {
				slog.Debug("payments: customer name not read", "err", err)
				return
			}
			if !ok {
				return
			}
			n := d.Name
			if n == "" {
				n = d.Email
			}
			mu.Lock()
			names[key] = &n
			mu.Unlock()
		}()
	}
	wg.Wait()
	out := *page
	out.Payments = append([]query.PayRow(nil), page.Payments...)
	out.Customers = append([]query.CustRow(nil), page.Customers...)
	for i := range out.Payments {
		if n := names[out.Payments[i].Customer]; n != nil {
			out.Payments[i].Name, out.Payments[i].Known = *n, true
		}
	}
	for i := range out.Customers {
		if n := names[out.Customers[i].Customer]; n != nil {
			out.Customers[i].Name, out.Customers[i].Known = *n, true
		}
	}
	return &out
}

type licenseOut struct {
	Last4       string   `json:"last4"`
	Status      string   `json:"status"`
	Used        int      `json:"used"`
	Limit       int      `json:"limit,omitempty"`
	CreatedAt   string   `json:"created_at,omitempty"`
	ExpiresAt   string   `json:"expires_at,omitempty"`
	Activations []string `json:"activations"`
}

func isoMs(ms int64) string {
	if ms <= 0 {
		return ""
	}
	return time.UnixMilli(ms).UTC().Format(time.RFC3339)
}

func licensesOut(l []payments.License) []licenseOut {
	out := make([]licenseOut, 0, len(l))
	for _, k := range l {
		o := licenseOut{Last4: k.Last4, Status: k.Status, Used: k.Used, Limit: k.Limit, CreatedAt: isoMs(k.CreatedAt), ExpiresAt: isoMs(k.ExpiresAt), Activations: []string{}}
		for _, at := range k.Activation {
			o.Activations = append(o.Activations, isoMs(at))
		}
		out = append(out, o)
	}
	return out
}

// customerDetail serves GET /api/v1/sites/{site}/sales/customers/{id}: one
// paying customer (the id the customer list gave) with their payments in the
// period and, when the provider can say, their name, email and license keys.
func (a *API) customerDetail(w http.ResponseWriter, r *http.Request) {
	if !a.needs(w, r, "revenue") || !a.revenueOn(w) {
		return
	}
	if !hasPerson(r) {
		fail(w, http.StatusForbidden, "sign in to see a customer")
		return
	}
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	ask := a.parse(w, r, r.PathValue("site"), true)
	if ask == nil {
		return
	}
	site, id := r.PathValue("site"), r.PathValue("id")
	p := ask.Params
	cur := p.Currency
	if cur == "" {
		cur = "USD"
	}
	ctx, cancel := context.WithTimeout(r.Context(), reportTimeout)
	defer cancel()
	facts, _, err := q.Payments(ctx, site, cur, p.From, p.To, p.Test)
	if err != nil {
		reportFail(w, err)
		return
	}
	// The id is the list's own: a hash of the ledger's customer key, which is
	// the provider's customer id, an email hash or a single payment. Found among
	// the period's payments, so every customer the list shows opens.
	key := ""
	for _, f := range facts {
		if query.HashID(site, f.Customer) == id {
			key = f.Customer
			break
		}
	}
	if key == "" {
		fail(w, http.StatusNotFound, "customer not found")
		return
	}
	type payOut struct {
		ID       string `json:"id"`
		At       string `json:"at"`
		Amount   int64  `json:"amount"`
		Refunded int64  `json:"refunded,omitempty"`
		Kind     string `json:"kind"`
	}
	pays := []payOut{}
	for _, f := range facts {
		if f.Customer == key {
			pays = append(pays, payOut{ID: query.HashID(site, f.ID), At: f.PaidAt.UTC().Format(time.RFC3339), Amount: f.Amount, Refunded: f.Refunded, Kind: f.Kind})
		}
	}
	out := map[string]any{"payments": pays, "licenses": []licenseOut{}}
	d, ok, err := a.Revenue.Details(ctx, site, key, true)
	if err != nil {
		slog.Debug("payments: customer details not read", "err", err)
	}
	if ok {
		out["name"], out["email"] = d.Name, d.Email
		out["licenses"] = licensesOut(d.Licenses)
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, out)
}
