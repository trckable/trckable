package api

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/trckable/trckable/server/internal/query"
)

// exportRows is how many rows of each breakdown an export carries. The
// dashboard shows five or twelve; somebody who asked for a file wants the
// long tail, and the cap keeps one careless export from being a hundred
// megabytes.
const exportRows = 1000

// exportDims is every breakdown in the file, in the order a person reads the
// dashboard: where they came from, what they read, who they are.
var exportDims = []struct{ dim, label string }{
	{"channel", "channel"},
	{"referrer", "referrer"},
	{"campaign", "campaign"},
	{"entry_page", "entry page"},
	{"page", "page"},
	{"exit_page", "exit page"},
	{"group", "section"},
	{"country", "country"},
	{"region", "region"},
	{"city", "city"},
	{"device", "device"},
	{"browser", "browser"},
	{"os", "operating system"},
}

// export serves GET /api/v1/sites/{site}/export.csv
//
// It takes exactly the parameters the report takes — the same range, the same
// filters, the same attribution model — so the file is the page you were
// looking at, not a different question with the same name.
//
// One long table rather than a folder of files: dimension, value, numbers.
// That is the shape a spreadsheet pivots without being rearranged first, and
// it is one file to email.
func (a *API) export(w http.ResponseWriter, r *http.Request) {
	q := a.Query()
	if q == nil {
		w.Header().Set("Retry-After", "2")
		fail(w, http.StatusServiceUnavailable, "analytics store warming up")
		return
	}
	siteID := r.PathValue("site")
	ask := a.parse(w, r, siteID, true)
	if ask == nil {
		return
	}
	p := ask.Params
	p.Limit = exportRows
	p.Daily = false // the series is already in the file, day by day
	p.Deep = true   // an export is the whole thing, not Core's subset

	res, err := q.Report(r.Context(), p)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}

	from := ask.From.Format("2006-01-02")
	to := ask.To.AddDate(0, 0, -1).Format("2006-01-02")
	name := fmt.Sprintf("%s-%s-to-%s.csv", safeName(siteID), from, to)
	h := w.Header()
	h.Set("Content-Type", "text/csv; charset=utf-8")
	h.Set("Content-Disposition", `attachment; filename="`+name+`"`)
	h.Set("Cache-Control", "no-store")

	c := csv.NewWriter(w)
	defer c.Flush()

	money := res.Money != nil
	head := []string{"dimension", "value", "visitors", "sessions", "pageviews", "bounce_rate"}
	if money {
		head = append(head, "revenue", "currency", "customers")
	}
	_ = c.Write(head)

	// Money is stored in minor units, and how many of those make one depends
	// on the currency — two for euros, none at all for yen.
	scale := 1.0
	digits := 0
	if money {
		digits = res.Money.Exponent
		for i := 0; i < digits; i++ {
			scale *= 10
		}
	}
	cash := func(minor *int64) string {
		if minor == nil {
			return ""
		}
		return strconv.FormatFloat(float64(*minor)/scale, 'f', digits, 64)
	}
	rate := func(v float64) string { return strconv.FormatFloat(v, 'f', 4, 64) }
	row := func(dim, value string, r query.Row) {
		out := []string{dim, value, strconv.FormatInt(r.Visitors, 10), strconv.FormatInt(r.Sessions, 10),
			strconv.FormatInt(r.Pageviews, 10), rate(r.Bounce)}
		if money {
			out = append(out, cash(r.Revenue), res.Money.Currency, strconv.FormatInt(r.Payers, 10))
		}
		_ = c.Write(out)
	}

	// The totals first, so the file opens on the number somebody is checking.
	total := query.Row{Visitors: res.KPIs.Visitors, Sessions: res.KPIs.Sessions, Pageviews: res.KPIs.Pageviews, Bounce: res.KPIs.BounceRate}
	if money {
		net := res.Money.Revenue
		total.Revenue = &net
		total.Payers = res.Money.Customers
	}
	row("total", from+" to "+to, total)

	// Then the chart, one bucket per row, so a spreadsheet can redraw it.
	for _, pt := range res.Series {
		r := query.Row{Visitors: pt.Visitors, Pageviews: pt.Pageviews}
		if money {
			v := pt.Revenue
			r.Revenue = &v
		}
		row(ask.Bucket, pt.T, r)
	}

	for _, d := range exportDims {
		for _, rw := range res.Dims[d.dim] {
			row(d.label, rw.Value, rw)
		}
	}
	for _, rw := range res.Goals {
		row("goal", rw.Value, rw)
	}
}

// safeName keeps a site id fit for a filename on any operating system.
func safeName(s string) string {
	s = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_', r == '.':
			return r
		default:
			return '-'
		}
	}, s)
	if s == "" {
		return "trckable"
	}
	return s
}
