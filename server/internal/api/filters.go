package api

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/trckable/trckable/server/internal/query"
)

// parseFilters turns repeated f=dim:value parameters into filters, rejecting
// anything outside the dimension whitelist. "dim!:value" is "is not". The
// same dimension named twice is "any of" (the query engine ORs them), so the
// dashboard's address, a saved segment, an export and an API call all say a
// filter the same way. Addresses from before "is not" parse as they always did.
func parseFilters(raw []string) ([]query.Filter, error) {
	var out []query.Filter
	for _, f := range raw {
		dim, val, ok := strings.Cut(f, ":")
		op := query.OpIs
		if d, not := strings.CutSuffix(dim, "!"); not {
			dim, op = d, query.OpNot
		}
		if !ok || !query.ValidDim(dim) || val == "" {
			return nil, fmt.Errorf("bad filter %q (use dim:value, or dim!:value for is not)", f)
		}
		out = append(out, query.Filter{Dim: dim, Op: op, Value: val})
	}
	return out, nil
}

// maxFilterParams keeps a request's list a list, before the engine counts
// values per dimension.
const maxFilterParams = 60

// filtersOf reads a request's filters: its f parameters, plus the filters of
// a saved segment named by ?segment=<id>. A segment belongs to its site, so
// another site's id is the same as no id.
func (a *API) filtersOf(ctx context.Context, site string, v url.Values) ([]query.Filter, error) {
	if len(v["f"]) > maxFilterParams {
		return nil, fmt.Errorf("at most %d filters", maxFilterParams)
	}
	out, err := parseFilters(v["f"])
	if err != nil {
		return nil, err
	}
	id := v.Get("segment")
	if id == "" {
		return out, nil
	}
	list, err := a.Ctl.Segments(ctx, site)
	if err != nil {
		return nil, fmt.Errorf("segments are not available")
	}
	for _, g := range list {
		if g.ID != id {
			continue
		}
		q, err := url.ParseQuery(g.Query)
		if err != nil {
			return nil, fmt.Errorf("segment %q is not readable", g.Name)
		}
		in, err := parseFilters(q["f"])
		if err != nil {
			return nil, fmt.Errorf("segment %q: %w", g.Name, err)
		}
		return append(out, in...), nil
	}
	return nil, fmt.Errorf("no segment %q on this site", id)
}

// viewRuns says whether a saved view's filters are ones a report can run.
func viewRuns(raw string) bool {
	q, err := url.ParseQuery(raw)
	if err != nil {
		return false
	}
	fs, err := parseFilters(q["f"])
	return err == nil && query.CheckFilters(fs) == nil
}
