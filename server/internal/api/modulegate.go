package api

import "net/http"

// moduleWrites is every route that changes something a module owns. While
// that module is off for the site, the route answers 404, the same as the
// module's reports: the dashboard hides the way in, and the server refuses
// the write for anyone who calls it directly.
//
// Two writes are deliberately missing: connecting a payment provider and
// connecting Search Console (and listing its properties) turn their module on, and disconnecting
// always works, so nothing is ever stuck behind a switch.
var moduleWrites = map[string]string{
	"POST /api/v1/sites/{site}/annotations":        "notes",
	"PATCH /api/v1/sites/{site}/annotations/{id}":  "notes",
	"DELETE /api/v1/sites/{site}/annotations/{id}": "notes",
	"PATCH /api/v1/sites/{site}/payments/{id}":     "revenue",
	"POST /api/v1/sites/{site}/payments/{id}/sync": "revenue",
	"POST /api/v1/sites/{site}/payments/reprocess": "revenue",
}

// moduleReads is the same for reads that exist only for one module.
var moduleReads = map[string]string{
	"GET /api/v1/sites/{site}/annotations": "notes",
	"GET /api/v1/sites/{site}/heat":        "heatmaps",
	"GET /api/v1/sites/{site}/heat-frame":  "heatmaps",
}

// gated wraps h so it answers 404 while the route's module is off.
func (a *API) gated(pattern string, h http.HandlerFunc) http.HandlerFunc {
	id := moduleWrites[pattern]
	if id == "" {
		id = moduleReads[pattern]
	}
	if id == "" {
		return h
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if a.needs(w, r, id) {
			h(w, r)
		}
	}
}
