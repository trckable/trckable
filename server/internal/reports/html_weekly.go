package reports

import (
	"fmt"

	"github.com/trckable/trckable/server/internal/mailkit"
)

// Weekly is what the weekly email says besides the report's own numbers
// (Data: the tiles and the two lists). The words are already in their
// sentences, as the plain-text twin has them.
type Weekly struct {
	Facts        []string             // AI, goal and revenue lines
	Moments      []string             // the busiest moment and the findings, new referrers among them
	Mentions     []mailkit.MentionRow // the week's top mentions, most visitors first; none hides the section
	MentionsMore int                  // mentions beyond those shown
	MentionsLink string               // the dashboard's Mentions page, for "+N more"
	Link         string               // the dashboard on that week; the button is left out without it
}

// WeeklyEmail is the weekly email on the kit: the week's numbers as a stat
// row with their change on last week, a bar for each day, the top sources and
// pages as bars, the week's findings and one button. The sender adds the stop
// link to its footer.
func WeeklyEmail(d Data, x Weekly) *mailkit.Email {
	w := d.words()
	m := &mailkit.Email{Lang: d.Lang, Title: w.YourWeek + " · " + d.Site, Foot: mailkit.Foot{StopLabel: w.Stop}}
	m.Blocks = []mailkit.Block{mailkit.Heading{Eyebrow: w.YourWeek, Title: d.Site, Sub: w.Range(d.From, d.To)}}
	if d.Empty() {
		m.Blocks = append(m.Blocks, mailkit.Callout{Tone: mailkit.Warn, Text: w.NoVisitors})
	} else {
		m.Preheader = d.preheader()
		m.Blocks = append(m.Blocks, d.stats(), mailkit.Paragraph{Muted: true, Text: d.Against()}, d.days(),
			d.list(w.TopSources, d.Sources()), d.list(w.TopPages, d.Pages()))
		for _, f := range x.Facts {
			m.Blocks = append(m.Blocks, mailkit.Paragraph{Text: f})
		}
		if len(x.Mentions) > 0 {
			m.Blocks = append(m.Blocks, d.mentions(x))
		}
		for _, s := range x.Moments {
			m.Blocks = append(m.Blocks, mailkit.Callout{Tone: mailkit.Celebrate, Text: s})
		}
	}
	m.Blocks = append(m.Blocks, mailkit.Button{Label: w.OpenWeek, URL: x.Link})
	return m
}

// mentions is the "who talked about you" section: each mention with the
// visitors it brought, and a link to the rest when there are more.
func (d Data) mentions(x Weekly) mailkit.Mentions {
	w := d.words()
	b := mailkit.Mentions{Title: w.Talked, Rows: x.Mentions}
	if x.MentionsMore > 0 && x.MentionsLink != "" {
		b.More, b.MoreURL = fmt.Sprintf(w.More, x.MentionsMore), x.MentionsLink
	}
	return b
}
