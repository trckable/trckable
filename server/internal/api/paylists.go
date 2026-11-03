package api

import (
	"context"
	"fmt"
	"net/http"
	"strconv"

	"github.com/trckable/trckable/server/internal/query"
)

// payList serves GET /api/v1/sites/{site}/sales/payments and /sales/customers:
// one page of the period's payments (newest first) or paying customers (biggest
// spenders first), credited the way the report credits them (its attribution,
// its filters, test payments when it asks for them), each with the visitor it
// belongs to so a row opens their journey. ?n= is the page size (at most 50),
// ?offset= where it starts (at most 10000). Needs a payment provider connected.
// Readable by every signed-in member and by API keys that may read, as the
// journey is; never a name, an email or a customer key. The public share link
// serves neither. The first page is kept like a report; later pages are read
// each time.
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
		if n <= 0 || n > query.MaxPayPage {
			n = 20
		}
		off, _ := strconv.Atoi(r.URL.Query().Get("offset"))
		if off < 0 || off > query.MaxPayOffset {
			fail(w, http.StatusBadRequest, "offset is out of range")
			return
		}
		p := ask.Params
		read := func(ctx context.Context) (any, error) { return q.PayList(ctx, p, customers, n, off) }
		var v any
		var err error
		if off == 0 {
			v, err = a.cachedRead(r, p, fmt.Sprintf("%s|pay|%t|%d", cacheKey(p), customers, n), read)
		} else {
			ctx, cancel := context.WithTimeout(r.Context(), reportTimeout)
			defer cancel()
			v, err = read(ctx)
		}
		if err != nil {
			reportFail(w, err)
			return
		}
		page := v.(*query.PayPage)
		out := map[string]any{"total": page.Total, "currency": page.Currency, "exponent": page.Exponent}
		if customers {
			out["customers"] = orEmpty(page.Customers)
		} else {
			out["payments"] = orEmpty(page.Payments)
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
