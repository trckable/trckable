package query

import (
	"fmt"
	"strings"
	"time"
)

// The two things a filter can say about a dimension.
const (
	OpIs  = "is"  // the visit's value is one of these (the default)
	OpNot = "not" // the visit's value is none of these
)

// MaxFilterValues is how many values one dimension can carry in a report:
// "country is DE, AT, CH" is a filter, a list of two hundred is a different
// question (and a very long query).
const MaxFilterValues = 20

// Filter restricts a report to sessions matching a dimension value. Filters
// that name the same dimension and the same Op are alternatives ("country is
// DE or AT"); different dimensions, and an "is" next to a "not", all have to
// hold.
type Filter struct {
	Dim   string `json:"dim"`
	Op    string `json:"op,omitempty"` // OpIs when empty
	Value string `json:"value"`
}

// group is every value one dimension and one Op carry, in the order asked.
type group struct {
	dim    string
	not    bool
	values []string
}

// groupFilters validates the filters and folds them into one group per
// dimension and Op, so a dimension becomes one condition however many values
// it holds. Repeats of a value are dropped.
func groupFilters(fs []Filter) ([]group, error) {
	var out []group
	perDim := map[string]int{}
	for _, f := range fs {
		if !ValidDim(f.Dim) {
			return nil, fmt.Errorf("unknown filter dimension %q", f.Dim)
		}
		if f.Op != "" && f.Op != OpIs && f.Op != OpNot {
			return nil, fmt.Errorf("unknown filter operator %q", f.Op)
		}
		not := f.Op == OpNot
		i := -1
		for j := range out {
			if out[j].dim == f.Dim && out[j].not == not {
				i = j
				break
			}
		}
		if i < 0 {
			out = append(out, group{dim: f.Dim, not: not})
			i = len(out) - 1
		}
		if contains(out[i].values, f.Value) {
			continue
		}
		if perDim[f.Dim] == MaxFilterValues {
			return nil, fmt.Errorf("at most %d values for %s", MaxFilterValues, f.Dim)
		}
		perDim[f.Dim]++
		out[i].values = append(out[i].values, f.Value)
	}
	return out, nil
}

// CheckFilters says whether the filters can run: known dimensions and
// operators, and no more values than a dimension may carry.
func CheckFilters(fs []Filter) error {
	_, err := groupFilters(fs)
	return err
}

func contains(vs []string, v string) bool {
	for _, x := range vs {
		if x == v {
			return true
		}
	}
	return false
}

// marks is n bound-parameter placeholders: "?, ?, ?".
func marks(n int) string {
	return strings.TrimSuffix(strings.Repeat("?, ", n), ", ")
}

func anyOf(vs []string) []any {
	out := make([]any, len(vs))
	for i, v := range vs {
		out[i] = v
	}
	return out
}

// filterWhere turns the report's filters into a WHERE clause over session
// columns (page/goal filters look up events between evFrom and evTo). Values
// are always bound parameters; only whitelisted columns reach the text.
func filterWhere(p Params, evFrom, evTo time.Time) (string, []any, error) {
	groups, err := groupFilters(p.Filters)
	if err != nil {
		return "", nil, err
	}
	var conds []string
	var args []any
	for _, g := range groups {
		cond, a, err := g.where(p, evFrom, evTo)
		if err != nil {
			return "", nil, err
		}
		conds = append(conds, cond)
		args = append(args, a...)
	}
	if len(conds) == 0 {
		return "", nil, nil
	}
	return " WHERE " + strings.Join(conds, " AND "), args, nil
}

// where is one group's condition. A "not" keeps the visits that have no value
// at all: "country is not US" includes the ones whose country is unknown.
func (g group) where(p Params, evFrom, evTo time.Time) (string, []any, error) {
	switch g.dim {
	case "goal":
		return g.goalWhere(p, evFrom, evTo)
	case "page":
		return g.eventsWhere(p, evFrom, evTo, "kind = 1 AND path "+g.positive(), anyOf(g.values))
	case "group":
		// Filtering by a section means "visits that read anything in it",
		// the same way a page filter means "visits that read that page".
		expr, matched := groupExpr(p.Groups, "path")
		if !matched {
			return "", nil, fmt.Errorf("this site has no content groups")
		}
		return g.eventsWhere(p, evFrom, evTo, "kind = 1 AND "+expr+" "+g.positive(), anyOf(g.values))
	}
	expr := sessionDims[g.dim]
	if g.not {
		return "(" + expr + " IS NULL OR " + expr + " " + g.in() + ")", anyOf(g.values), nil
	}
	return expr + " " + g.in(), anyOf(g.values), nil
}

// in is the comparison for this group's values: "= ?" or "IN (?, ?)", and
// their negations.
func (g group) in() string {
	one := len(g.values) == 1
	switch {
	case g.not && one:
		return "<> ?"
	case g.not:
		return "NOT IN (" + marks(len(g.values)) + ")"
	case one:
		return "= ?"
	}
	return "IN (" + marks(len(g.values)) + ")"
}

// positive is the comparison inside a subquery, which is always "does the
// visit have one of these": a "not" negates the visit, not the event.
func (g group) positive() string {
	if len(g.values) == 1 {
		return "= ?"
	}
	return "IN (" + marks(len(g.values)) + ")"
}

// eventsWhere wraps an event condition: the visits that have such an event
// (is), or none (not).
func (g group) eventsWhere(p Params, evFrom, evTo time.Time, match string, margs []any) (string, []any, error) {
	in, tail := "IN", ""
	if g.not {
		in, tail = "NOT IN", " AND session_id IS NOT NULL" // a NULL in a NOT IN list would drop every row
	}
	cond := `session_id ` + in + ` (SELECT session_id FROM events
				WHERE site_id = ? AND ts >= ? AND ts < ? + INTERVAL 1 DAY AND ` + match + tail + `)`
	return cond, append([]any{p.Site, evFrom, evTo}, margs...), nil
}

// goalWhere: a page goal is a page seen, a custom goal is an event sent, and
// one dimension can carry both.
func (g group) goalWhere(p Params, evFrom, evTo time.Time) (string, []any, error) {
	var alts []string
	var custom []string
	for _, v := range g.values {
		pg, ok := pageGoal(p.PageGoals, v)
		if !ok {
			custom = append(custom, v)
			continue
		}
		cond, ok := pageMatch(pg, "path")
		if !ok {
			return "", nil, fmt.Errorf("page goal %q has no path", v)
		}
		alts = append(alts, "(kind = 1 AND "+cond+")")
	}
	var args []any
	if len(custom) > 0 {
		sub := group{values: custom}
		alts = append(alts, "(kind = 2 AND goal "+sub.positive()+")")
		args = anyOf(custom)
	}
	return g.eventsWhere(p, evFrom, evTo, "("+strings.Join(alts, " OR ")+")", args)
}
