package api

import (
	"context"
	"fmt"
	"net/http"

	"github.com/trckable/trckable/server/internal/query"
)

// paths serves GET /api/v1/sites/{site}/report/paths: the routes visitors take
// (the first three pages of a visit), the busiest first, with the numbers
// above them. The report's period and filters apply. It is kept like a
// report, so a second look at the same period costs nothing.
func (a *API) paths(w http.ResponseWriter, r *http.Request) {
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	ask := a.parse(w, r, r.PathValue("site"), false)
	if ask == nil {
		return
	}
	p := ask.Params
	p.Daily, p.Deep, p.Limit = false, false, query.PathsShown
	v, err := a.cachedRead(r, p, fmt.Sprintf("%s|paths", cacheKey(p)), func(ctx context.Context) (any, error) { return q.Paths(ctx, p) })
	if err != nil {
		reportFail(w, err)
		return
	}
	res := v.(*query.PathsResult)
	writeJSON(w, http.StatusOK, map[string]any{"visits": res.Visits, "single": res.Single, "pages": res.Pages, "first": res.First, "last": res.Last, "routes": res.Routes, "goals": p.Goals})
}
