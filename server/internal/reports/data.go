// Package reports writes the scheduled report a site's client receives: an
// HTML email, a plain-text twin and a PDF, from one set of numbers, in the
// client's language and the site's own look (logo, colour, and whether
// trckable's name is left off). It draws; it never sends and never reads.
package reports

import (
	"time"

	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/summary"
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
		name := r.Name()
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

// Summary is the report's numbers, read once: every line below says these.
func (d Data) Summary() summary.Summary { return summary.Build(d.Cur, d.Prev) }

// Money is the period's revenue line, or "" when there is none to say.
func (d Data) Money() (amount, change string) {
	m := d.Summary().Money
	if m == nil {
		return "", ""
	}
	w := d.words()
	amount = w.Say.Money(m.Revenue.Now, m.Currency, m.Exponent) + " · " + w.Number(m.Payments) + " " + w.Payments
	if m.HasPrev {
		change = w.Say.Say(m.Revenue.Move)
	}
	return amount, change
}

// Tile is one number of the report's top row.
type Tile struct {
	Label, Value, Change string
	Trend                int // above zero up, below down, zero about the same
}

// Tiles are the four numbers on top: visitors, pageviews, bounce rate and
// how long a visit lasted, each against the period before.
func (d Data) Tiles() []Tile {
	w, s := d.words(), d.Summary()
	return []Tile{
		{w.Visitors, w.Number(s.People.Now), w.Say.Say(s.People.Move), s.People.Move.Dir},
		{w.Pageviews, w.Number(s.Pageviews.Now), w.Say.Say(s.Pageviews.Move), s.Pageviews.Move.Dir},
		{w.Bounce, w.Number(int64(s.BounceRate*100+0.5)) + "%", "", 0},
		{w.Session, Duration(s.AvgSessionS), "", 0},
	}
}
