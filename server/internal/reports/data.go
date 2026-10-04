// Package reports writes the scheduled report a site's client receives: an
// HTML email, a plain-text twin and a PDF, from one set of numbers, in the
// client's language and the site's own look (logo, colour, and whether
// trckable's name is left off). It draws; it never sends and never reads.
package reports

import (
	"time"

	"github.com/trckable/trckable/server/internal/query"
)

// Brand is the look a report wears: the same as the site's share links.
type Brand struct {
	Name      string // what the report is from: the site's name, or "trckable"
	Color     string // #rrggbb, or "" for trckable's own
	HideBrand bool   // leave trckable's name off
	Logo      []byte // PNG, JPEG or GIF; an SVG is never passed (mail clients and PDF cannot draw it)
	LogoType  string // its media type
}

// Data is one report.
type Data struct {
	Site    string // the site's name or domain
	Client  string // who it is for, from the schedule; may be empty
	Cadence string // "weekly" or "monthly"
	Lang    string
	From    time.Time // the first day (site time)
	To      time.Time // the day after the last
	Cur     *query.Result
	Prev    *query.Result
	Brand   Brand
	// Unsubscribe is the address that stops this report for this person.
	Unsubscribe string
}

func (d Data) words() Words { return For(d.Lang) }

// Title is "Weekly report" or "Monthly report".
func (d Data) Title() string {
	if d.Cadence == "monthly" {
		return d.words().Monthly
	}
	return d.words().Weekly
}

// Against is "vs the week before" or "vs the month before".
func (d Data) Against() string {
	if d.Cadence == "monthly" {
		return d.words().VsMonth
	}
	return d.words().VsWeek
}

// Subject is the email's subject: the title, the site, the period.
func (d Data) Subject() string {
	return d.Title() + " · " + d.Site + " · " + d.words().Range(d.From, d.To)
}

// Accent is the colour of the report's accents.
func (d Data) Accent() string {
	if d.Brand.Color != "" {
		return d.Brand.Color
	}
	return "#487f00"
}

// Ink is the text colour that reads on the accent: black or white.
func Ink(hex string) string {
	if len(hex) != 7 || hex[0] != '#' {
		return "#ffffff"
	}
	var c [3]float64
	for i := range c {
		v := 0
		for _, ch := range hex[1+2*i : 3+2*i] {
			v *= 16
			switch {
			case ch >= '0' && ch <= '9':
				v += int(ch - '0')
			case ch >= 'a' && ch <= 'f':
				v += int(ch-'a') + 10
			case ch >= 'A' && ch <= 'F':
				v += int(ch-'A') + 10
			}
		}
		c[i] = float64(v) / 255
	}
	if 0.2126*c[0]+0.7152*c[1]+0.0722*c[2] > 0.5 {
		return "#111111"
	}
	return "#ffffff"
}

// Row is a line of a list: a name and its visitors.
type Row struct {
	Name  string
	Value int64
}

// rows are the first n rows of a breakdown, named for the language.
func (d Data) rows(rs []query.Row, n int) []Row {
	var out []Row
	for _, r := range rs {
		if len(out) == n {
			break
		}
		name := r.Value
		if name == "AI" {
			name = d.words().AI
		}
		out = append(out, Row{name, r.Visitors})
	}
	return out
}

// Sources, Pages and Goals are the lists the report shows, three each.
func (d Data) Sources() []Row { return d.rows(d.Cur.Dims["channel"], 3) }
func (d Data) Pages() []Row   { return d.rows(d.Cur.Dims["entry_page"], 3) }
func (d Data) Goals() []Row   { return d.rows(d.Cur.Goals, 3) }

// Empty says nobody came in the period.
func (d Data) Empty() bool { return d.Cur.KPIs.Visitors == 0 }

// Money is the period's revenue line, or "" when there is none to say.
func (d Data) Money() (amount, change string) {
	m := d.Cur.Money
	if m == nil || m.Payments == 0 {
		return "", ""
	}
	w := d.words()
	amount = w.Money(m.Revenue, m.Currency, m.Exponent) + " · " + w.Number(m.Payments) + " " + w.Payments
	if d.Prev != nil && d.Prev.Money != nil {
		change = w.Change(float64(m.Revenue), float64(d.Prev.Money.Revenue))
	}
	return amount, change
}

// Tile is one number of the report's top row.
type Tile struct{ Label, Value, Change string }

// Tiles are the four numbers on top: visitors, pageviews, bounce rate and
// how long a visit lasted, each against the period before.
func (d Data) Tiles() []Tile {
	w, k, p := d.words(), d.Cur.KPIs, d.Prev.KPIs
	return []Tile{
		{w.Visitors, w.Number(k.Visitors), w.Change(float64(k.Visitors), float64(p.Visitors))},
		{w.Pageviews, w.Number(k.Pageviews), w.Change(float64(k.Pageviews), float64(p.Pageviews))},
		{w.Bounce, w.Number(int64(k.BounceRate*100+0.5)) + "%", ""},
		{w.Session, Duration(k.AvgSessionS), ""},
	}
}
