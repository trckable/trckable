package api

import (
	"cmp"
	"fmt"
	"math"
	"slices"
	"strconv"

	"github.com/trckable/trckable/server/internal/cards"
	"github.com/trckable/trckable/server/internal/query"
)

// What changed, for the picture: the dashboard's own rule (dashboard/src/v2/why/model.ts) for the people of the
// period against the period before, in the same words (explore/copy.ts). The report's own figures only: a
// breakdown's rows are compared, nothing is estimated.

// changedDims are the tables whose rows are compared.
var changedDims = []string{"referrer", "entry_page", "country", "device"}

const (
	changedMinBase   = 20  // under this many people in both periods there is too little to compare
	changedFlatPct   = 5   // a move under this share is not one
	changedTruncated = 10  // a table this long may have been cut: a row missing from it is not proven to be zero
	changedRowPct    = 0.2 // a row must move by a fifth of its own size
	changedMax       = 8
	changedCauses    = 5
	changedTimes     = 100 // a multiple is never written above this
)

// cause is one row that moved: its table, its name, and its people in both periods.
type cause struct {
	dim, value string
	was, now   int64
	diff       int64
}

func (c cause) weight() float64 {
	w := math.Abs(float64(c.diff))
	if c.dim == "device" {
		w *= 0.5
	}
	return w
}

// changeOf is the report's change in words: the sentence, and the biggest changes of every table.
type changeOf struct {
	say    string
	causes []cause
	ok     bool // there are two periods with people to compare
}

func smallest(rows []query.Row) int64 {
	if len(rows) < changedTruncated {
		return 0
	}
	m := rows[0].Visitors
	for _, r := range rows {
		m = min(m, r.Visitors)
	}
	return m
}

func moversIn(cur, prev *query.Result, dim string) []cause {
	now, was := cur.Dims[dim], prev.Dims[dim]
	var list []cause
	seen := map[string]bool{}
	for _, x := range now {
		w := smallest(was)
		if i := slices.IndexFunc(was, func(y query.Row) bool { return y.Value == x.Value }); i >= 0 {
			w = was[i].Visitors
		}
		seen[x.Value] = true
		list = append(list, cause{dim, x.Value, w, x.Visitors, x.Visitors - w})
	}
	for _, y := range was {
		if !seen[y.Value] {
			n := smallest(now)
			list = append(list, cause{dim, y.Value, y.Visitors, n, n - y.Visitors})
		}
	}
	list = slices.DeleteFunc(list, func(c cause) bool { return c.diff == 0 })
	slices.SortStableFunc(list, func(a, b cause) int { return cmp.Compare(math.Abs(float64(b.diff)), math.Abs(float64(a.diff))) })
	return list
}

// biggestChanges are the rows that moved most across every table, at least a tenth of the whole gap and 3% of the
// larger period, and a fifth of their own size.
func biggestChanges(cur, prev *query.Result) []cause {
	now, was := cur.KPIs.Visitors, prev.KPIs.Visitors
	if max(now, was) < changedMinBase {
		return nil
	}
	floor := math.Max(math.Abs(float64(now-was))*0.1, float64(max(now, was))*0.03)
	var list []cause
	for _, d := range changedDims {
		for _, c := range moversIn(cur, prev, d) {
			if math.Abs(float64(c.diff)) >= floor && math.Abs(float64(c.diff)) >= float64(max(c.now, c.was))*changedRowPct {
				list = append(list, c)
			}
		}
	}
	slices.SortStableFunc(list, func(a, b cause) int { return cmp.Compare(b.weight(), a.weight()) })
	return list[:min(len(list), changedMax)]
}

// explainChange is the sentence for the people of the period against the one before, and the table whose top movers
// tell the story in the fewest rows: the leading causes.
func explainChange(cur, prev *query.Result) changeOf {
	now, was := cur.KPIs.Visitors, prev.KPIs.Visitors
	if max(now, was) < changedMinBase {
		return changeOf{say: cardWords.changedFew}
	}
	diff := now - was
	var pct float64
	hasPct := was > 0
	if hasPct {
		pct = float64(diff) / float64(was) * 100
	}
	big := math.Abs(pct) >= changedFlatPct || !hasPct
	var best []cause
	reach := -1.0
	for _, d := range changedDims {
		list := moversIn(cur, prev, d)
		r := 0.0
		for _, c := range list[:min(len(list), changedCauses)] {
			r += math.Abs(float64(c.diff))
		}
		if d == "device" {
			r *= 0.5
		}
		if r > reach {
			best, reach = list, r
		}
	}
	floor := math.Max(math.Abs(float64(diff))*0.1, float64(max(now, was))*0.03)
	var causes []cause
	for _, c := range best {
		if math.Abs(float64(c.diff)) >= floor && len(causes) < changedCauses {
			causes = append(causes, c)
		}
	}
	name := cardWords.changedPeople
	out := changeOf{ok: true, causes: causes}
	switch {
	case len(causes) == 0 && !big, len(causes) > 0 && !big && math.Abs(float64(causes[0].diff)) < float64(max(now, was))*0.1:
		out.say = cardWords.changedFlat
		out.causes = nil
	case !big:
		out.say = fmt.Sprintf(cardWords.changedMix, name)
	case !hasPct:
		out.say = fmt.Sprintf(cardWords.changedNew, name)
	default:
		out.say = sayMoved(name, pct, diff, causes)
	}
	return out
}

func sayMoved(name string, pct float64, diff int64, causes []cause) string {
	verb := cardWords.changedRose
	by := fmt.Sprintf("%.0f%%", math.Round(math.Abs(pct)))
	if pct >= 100 {
		by = times(pct/100 + 1)
	} else if pct < 0 {
		verb = cardWords.changedFell
	}
	moved := fmt.Sprintf("%s %s %s", name, verb, by)
	if len(causes) == 0 {
		return moved + "."
	}
	place := causeName(causes[0])
	if causes[0].value == "/" {
		place = cardWords.theHomePage
	}
	if diff != 0 && float64(causes[0].diff)/float64(diff) > 0.5 {
		return fmt.Sprintf(cardWords.changedMostly, moved, place)
	}
	return fmt.Sprintf(cardWords.changedLed, moved, place)
}

// times is a multiple the way the dashboard writes it: one decimal under ten, whole above, never a huge one.
func times(r float64) string {
	r = math.Min(r, changedTimes)
	if r >= 10 {
		return strconv.FormatFloat(math.Round(r), 'f', 0, 64) + "×"
	}
	return strconv.FormatFloat(math.Round(r*10)/10, 'f', -1, 64) + "×"
}

// causeName is a row as people say it: no referrer is Direct, a bare slash is the home page, a country by name.
func causeName(c cause) string {
	switch {
	case c.dim == "country" && c.value != "":
		if n := countryName(c.value); n != "" {
			return n
		}
	case c.value == "/":
		return cardWords.homePage
	case c.value == "":
		return cardWords.direct
	}
	return c.value
}

// signed is a change with its sign: +120, −45.
func signed(n int64) string {
	if n < 0 {
		return "−" + number(-n)
	}
	return "+" + number(n)
}

// changeRows are the biggest changes as picture lines, the longest bar for the biggest move.
func changeRows(causes []cause) []cards.Item {
	var items []cards.Item
	top := 0.0
	for _, c := range causes[:min(len(causes), cards.MaxDigestRows)] {
		top = math.Max(top, math.Abs(float64(c.diff)))
	}
	for _, c := range causes[:min(len(causes), cards.MaxDigestRows)] {
		items = append(items, cards.Item{Name: causeName(c), Value: signed(c.diff), Share: math.Abs(float64(c.diff)) / top})
	}
	return items
}
