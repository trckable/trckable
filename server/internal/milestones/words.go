package milestones

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The words the card, the share page and the alert say. The dashboard's own
// words are in its message files (dashboard/src/features/milestones/copy.ts);
// these are the server's, kept in one place the same way.
var words = struct {
	visitors, pageviews, firstPageview, countries, record, revenue, revenueHidden, milestone, firstGoal, firstSale, first string
	alertTitle, made, pageTitle, reached                                                                                  string
}{
	visitors:      "visitors",
	pageviews:     "pageviews",
	firstPageview: "pageview",
	countries:     "countries",
	record:        "visitors · record day",
	revenue:       "revenue",
	revenueHidden: "Revenue",
	milestone:     "milestone",
	firstGoal:     "First goal",
	firstSale:     "First sale",
	first:         "First",
	alertTitle:    "Milestone reached",
	made:          "Made with trckable",
	pageTitle:     "%s on %s",
	reached:       "reached on %s",
}

// Words is how a milestone reads: the big part and the line under it.
type Words struct {
	Big   string
	Label string
	Day   string // Sep 21, 2026
}

// Say puts a milestone into words. showAmount false leaves the amount of a
// money milestone out.
func Say(m sqlite.Milestone, showAmount bool) Words {
	w := Words{Day: longDay(m.Day)}
	switch m.Kind {
	case Visitors:
		w.Big, w.Label = Number(m.Value), words.visitors
	case Pageviews:
		w.Big, w.Label = Number(m.Value), words.pageviews
		if m.Value == 1 {
			w.Big, w.Label = words.first, words.firstPageview
		}
	case Countries:
		w.Big, w.Label = Number(m.Value), words.countries
	case RecordDay:
		w.Big, w.Label = Number(m.Value), words.record
	case FirstGoal:
		w.Big = words.firstGoal
	case FirstSale:
		w.Big = words.firstSale
	case Revenue:
		w.Big, w.Label = Amount(m.Value, m.Currency), words.revenue
		if !showAmount {
			w.Big, w.Label = words.revenueHidden, words.milestone
		}
	}
	return w
}

// Line is the milestone in one line: "10,000 visitors", "First sale".
func (w Words) Line() string { return strings.TrimSpace(w.Big + " " + w.Label) }

// Number writes 10000 as 10,000.
func Number(v float64) string {
	s := strconv.FormatInt(int64(v), 10)
	var b strings.Builder
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(c)
	}
	return b.String()
}

var symbols = map[string]string{"USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥", "INR": "₹", "AUD": "A$", "CAD": "C$"}

// Amount writes an amount of a currency the way a card shows it: $1,000,
// or 1,000 CHF where the currency has no short sign.
func Amount(v float64, currency string) string {
	if s, ok := symbols[strings.ToUpper(currency)]; ok {
		return s + Number(v)
	}
	return strings.TrimSpace(Number(v) + " " + strings.ToUpper(currency))
}

func longDay(day string) string {
	t, err := time.Parse(time.DateOnly, day)
	if err != nil {
		return day
	}
	return t.Format("Jan 2, 2006")
}

// Page is what the share page says.
type Page struct {
	Title, Reached, Made, Image string
}

// PageWords puts a milestone's words on its share page.
func PageWords(w Words, domain string) Page {
	return Page{Title: fmt.Sprintf(words.pageTitle, w.Line(), domain), Reached: fmt.Sprintf(words.reached, w.Day), Made: words.made}
}

// AlertLine is the milestone as an alert says it.
func AlertLine(w Words, domain string) (title, message string) {
	return words.alertTitle, fmt.Sprintf(words.pageTitle, w.Line(), domain) + ", " + fmt.Sprintf(words.reached, w.Day) + "."
}
