package api

import (
	"net/http"
)

// linksShown is how many links one answer lists.
const linksShown = 50

// links serves GET /api/v1/sites/{site}/report/links: the tagged links of the
// period (a ?ref tag with the site it names counted in, or a utm_source), the
// busiest first, each with its visitors, the visitors who reached a goal, the
// revenue credited to it, its latest visit and a small chart. The report's
// period and filters apply; goals and revenue appear only while their modules
// are on.
func (a *API) links(w http.ResponseWriter, r *http.Request) {
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
	p := ask.Params
	p.Daily, p.Deep, p.Limit = false, false, linksShown
	rows, err := q.Links(r.Context(), p)
	if err != nil {
		reportFail(w, err)
		return
	}
	out := map[string]any{"links": rows, "goals": p.Goals}
	if p.Revenue && len(rows) > 0 {
		// Revenue is the report's own reading of each referrer, so the figure
		// is the one Sources shows for the same row.
		rp := p
		rp.Limit, rp.Goals = 100, false
		res, err := a.cachedReport(r, q, rp)
		if err != nil {
			reportFail(w, err)
			return
		}
		if res.Money != nil {
			byRef := map[string]int64{}
			for _, d := range res.Dims["referrer"] {
				if d.Revenue != nil {
					byRef[d.Value] = *d.Revenue
				}
			}
			for i := range rows {
				if rows[i].Dim != "referrer" {
					continue
				}
				v := byRef[rows[i].Value]
				rows[i].Revenue = &v
			}
			out["currency"], out["exponent"] = res.Money.Currency, res.Money.Exponent
		}
	}
	writeJSON(w, http.StatusOK, out)
}
