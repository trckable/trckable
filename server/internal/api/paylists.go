package api

import (
	"net/http"
	"strconv"
)

// payPage is how many rows a page of the payment lists holds at most.
const payPage = 50

// payList serves GET /api/v1/sites/{site}/sales/payments and /sales/customers: one page of
// the period's payments (newest first) or paying customers (biggest spenders
// first), read the way the report credits them (its attribution, its filters,
// test payments when it asks for them), with the visitor each belongs to so a
// row opens their journey. ?n= is the page size (at most 50), ?offset= where it
// starts. Needs a payment provider connected. Never a name, an email or a
// customer key; signed-in people only, the public share link serves neither.
func (a *API) payList(customers bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !a.needs(w, r, "revenue") {
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
		n, _ := strconv.Atoi(r.URL.Query().Get("n"))
		if n <= 0 || n > payPage {
			n = 20
		}
		off, _ := strconv.Atoi(r.URL.Query().Get("offset"))
		if off < 0 {
			off = 0
		}
		p := ask.Params
		p.Daily, p.Deep, p.Sales, p.Buyers = false, false, false, 0
		if customers {
			p.CustList, p.CustOffset = n, off
		} else {
			p.PayList, p.PayOffset = n, off
		}
		res, err := a.cachedReport(r, q, p)
		if err != nil {
			reportFail(w, err)
			return
		}
		out := map[string]any{}
		if customers {
			out["customers"], out["total"] = orEmpty(res.CustList), res.CustTotal
		} else {
			out["payments"], out["total"] = orEmpty(res.PayList), res.PayTotal
		}
		if res.Money != nil {
			out["currency"], out["exponent"] = res.Money.Currency, res.Money.Exponent
		}
		writeJSON(w, http.StatusOK, out)
	}
}

func orEmpty[T any](l []T) []T {
	if l == nil {
		return []T{}
	}
	return l
}
