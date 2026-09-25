package api

import (
	"net/http"
	"sort"
	"time"

	"github.com/trckable/trckable/server/internal/query"
)

// milestones are the moments the dashboard celebrates, read from the data:
// visitor steps, the best day, the first AI visit, the first sale. Each has a
// stable id, so the dashboard shows it once; newest first.
func (a *API) milestones(w http.ResponseWriter, r *http.Request) {
	si, err := a.Ctl.SiteInfo(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	q := a.Query
	if q == nil || q() == nil {
		writeJSON(w, http.StatusOK, map[string]any{"milestones": []query.Milestone{}})
		return
	}
	list, err := q().Milestones(r.Context(), si.ID, si.Timezone)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	// The first real sale (test payments are not a milestone).
	if a.moduleOn(r, si.ID, "revenue") {
		var first int64
		if err := a.Ctl.DB.QueryRowContext(r.Context(), `SELECT coalesce(min(paid_at), 0) FROM pay_payments WHERE site_id = ? AND test = 0`, si.ID).Scan(&first); err == nil && first > 0 {
			loc, err := time.LoadLocation(si.Timezone)
			if err != nil {
				loc = time.UTC
			}
			// The ledger keeps payment times in milliseconds.
			list = append(list, query.Milestone{ID: "first-sale", Kind: "first_sale", Value: 1, Day: time.UnixMilli(first).In(loc).Format("2006-01-02")})
		}
	}
	sort.SliceStable(list, func(i, j int) bool { return list[i].Day > list[j].Day })
	if list == nil {
		list = []query.Milestone{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"milestones": list})
}
