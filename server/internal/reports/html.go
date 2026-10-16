package reports

import (
	"fmt"
	"time"

	"github.com/trckable/trckable/server/internal/mailkit"
)

// Email is the report as an email, drawn by the mail kit: the client's look
// (logo, colour, and trckable's name left off when asked), the four numbers
// with their change, the lists as bars, in the client's language. Everything
// that came from outside is escaped when it is drawn.
func Email(d Data) mailkit.Email {
	w := d.words()
	title := d.Site
	if d.Client != "" {
		title = d.Client
	}
	m := mailkit.Email{Lang: d.Lang, Title: d.Subject(), Brand: d.kitBrand()}
	m.Blocks = []mailkit.Block{mailkit.Heading{Eyebrow: d.Title(), Title: title, Sub: d.Site + " · " + w.Range(d.From, d.To)}}
	if d.Empty() {
		m.Blocks = append(m.Blocks, mailkit.Paragraph{Text: w.NoVisitors})
	} else {
		m.Preheader = d.preheader()
		m.Blocks = append(m.Blocks, d.stats(), mailkit.Paragraph{Muted: true, Text: d.Against()}, d.days())
		if amount, change := d.Money(); amount != "" {
			line := amount
			if change != "" {
				line += " (" + change + ")"
			}
			m.Blocks = append(m.Blocks, mailkit.Rows{Rows: [][2]string{{w.Revenue, line}}})
		}
		m.Blocks = append(m.Blocks, d.list(w.TopSources, d.Sources()), d.list(w.TopPages, d.Pages()), d.list(w.TopGoals, d.Goals()))
	}
	sender := "trckable"
	if d.Brand.HideBrand {
		sender = d.Brand.Name
	}
	m.Foot = mailkit.Foot{Note: fmt.Sprintf(w.SentBy, sender), Links: []mailkit.Link{{Label: w.Stop, URL: d.Unsubscribe}}}
	return m
}

// kitBrand is the report's look for the kit: trckable's own unless the site
// has a logo, a colour or hides trckable's name.
func (d Data) kitBrand() mailkit.Brand {
	b := d.Brand
	if len(b.Logo) == 0 && b.Color == "" && !b.HideBrand {
		return mailkit.Brand{}
	}
	name := b.Name
	if name == "" {
		name = d.Site
	}
	return mailkit.Brand{Name: name, Logo: b.Logo, LogoType: b.LogoType, Accent: b.Color, Hide: b.HideBrand}
}

// preheader is the inbox's preview line: the first number and its change.
func (d Data) preheader() string {
	t := d.Tiles()[0]
	return t.Label + ": " + t.Value + " (" + t.Change + ")"
}

// stats are the report's tiles as the kit's stat row.
func (d Data) stats() mailkit.Stats {
	var s mailkit.Stats
	for _, t := range d.Tiles() {
		s.Items = append(s.Items, mailkit.Stat{Label: t.Label, Value: t.Value, Change: t.Change, Trend: t.Trend})
	}
	return s
}

// list is one of the report's lists as bars; a long name keeps its start.
func (d Data) list(title string, rows []Row) mailkit.List {
	l := mailkit.List{Title: title}
	for _, r := range rows {
		l.Rows = append(l.Rows, mailkit.Bar{Name: mailkit.Cut(r.Name, 40), Value: d.words().Number(r.Value), N: r.Value})
	}
	return l
}

// days are the visitors of each day of the period, oldest first, with the
// weekday under each bar and the best day lit; none for a period longer than two weeks.
func (d Data) days() mailkit.Spark {
	w := d.words()
	s := mailkit.Spark{Caption: w.PerDay, Peak: true}
	if len(d.Cur.Series) > 14 {
		return s
	}
	for _, p := range d.Cur.Series {
		day, err := time.Parse(time.DateOnly, p.T[:min(10, len(p.T))])
		if err != nil {
			return mailkit.Spark{}
		}
		s.Values = append(s.Values, p.Visitors)
		s.Ticks = append(s.Ticks, w.Weekday(day))
	}
	return s
}

// HTML is the report as an email.
func HTML(d Data) string { return Email(d).HTML() }

// Text is the same report as plain text, for the clients that show only that.
func Text(d Data) string { return Email(d).Text() }

// Images are the pictures the email shows: the client's logo, or the ghost.
func Images(d Data) []mailkit.Picture { return Email(d).Images() }
