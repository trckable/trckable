package milestones

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Tongue is the words a milestone card says, in one language, and the way that language writes its numbers,
// amounts and days. English is the server's own (alerts, the share page, mail); a card can be drawn in another, which
// the share pictures' language table (the api package) supplies.
type Tongue struct {
	Visitors, Pageviews, FirstPageview, Countries, Record, Revenue, RevenueHidden, RevenueReached, RevenueLine, Milestone, FirstGoal, FirstSale, First string
	SearchClicks, AIVisits                                                                                                                             string
	AfterSale, AfterSaleOne, Faster                                                                                                                    string // %d days after the first sale; %d day; %d times faster
	PageTitle, PageReached, PageMade                                                                                                                   string // "%s on %s"; "reached on %s"; the share page's footer link
	Fmt                                                                                                                                                Formatter
}

// Formatter writes a count, an amount of a currency and a day the way its language does.
type Formatter interface {
	Number(v float64) string
	Amount(v float64, currency string) string
	Day(t time.Time) string
}

type englishFmt struct{}

func (englishFmt) Number(v float64) string             { return Number(v) }
func (englishFmt) Amount(v float64, cur string) string { return Amount(v, cur) }
func (englishFmt) Day(t time.Time) string              { return t.Format("Jan 2, 2006") }

// English is the language of everything but a card asked for in another.
var English = &Tongue{
	Visitors:       "people",
	Pageviews:      "pageviews",
	FirstPageview:  "pageview",
	Countries:      "countries",
	Record:         "people · record day",
	Revenue:        "revenue",
	RevenueHidden:  "Revenue",
	RevenueReached: "Revenue milestone reached",
	RevenueLine:    "revenue milestone",
	Milestone:      "milestone",
	FirstGoal:      "First goal",
	FirstSale:      "First sale",
	First:          "First",
	SearchClicks:   "Google Search clicks · 28 days",
	AIVisits:       "visits from AI assistants",
	AfterSale:      "%d days after the first sale",
	AfterSaleOne:   "%d day after the first sale",
	Faster:         "%d× faster than the last one",
	PageTitle:      "%s on %s",
	PageReached:    "reached on %s",
	PageMade:       "Made with trckable",
	Fmt:            englishFmt{},
}

// The words the share page and the alert say.
var words = struct {
	alertTitle string
}{
	alertTitle: "Milestone reached",
}

// Words is how a milestone reads: the big part and the line under it.
type Words struct {
	Kind  string
	Big   string
	Label string
	Day   string // Sep 21, 2026
}

// Say puts a milestone into words. showAmount false leaves the amount of a
// money milestone out.
func Say(m sqlite.Milestone, showAmount bool) Words { return SayIn(English, m, showAmount) }

// SayIn is Say in a language.
func SayIn(t *Tongue, m sqlite.Milestone, showAmount bool) Words {
	w := Words{Kind: m.Kind, Day: longDay(t, m.Day)}
	switch m.Kind {
	case Visitors:
		w.Big, w.Label = t.Fmt.Number(m.Value), t.Visitors
	case Pageviews:
		w.Big, w.Label = t.Fmt.Number(m.Value), t.Pageviews
		if m.Value == 1 {
			w.Big, w.Label = t.First, t.FirstPageview
		}
	case Countries:
		w.Big, w.Label = t.Fmt.Number(m.Value), t.Countries
	case SearchClicks:
		w.Big, w.Label = t.Fmt.Number(m.Value), t.SearchClicks
	case AIVisits:
		w.Big, w.Label = t.Fmt.Number(m.Value), t.AIVisits
	case RecordDay:
		w.Big, w.Label = t.Fmt.Number(m.Value), t.Record
	case FirstGoal:
		w.Big = t.FirstGoal
	case FirstSale:
		w.Big = t.FirstSale
	case Revenue:
		w.Big, w.Label = t.Fmt.Amount(m.Value, m.Currency), t.Revenue
		if !showAmount {
			w.Big, w.Label = t.RevenueHidden, t.Milestone
		}
	}
	return w
}

// Line is the milestone in one line: "10,000 people", "First sale".
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

func longDay(t *Tongue, day string) string {
	d, err := time.Parse(time.DateOnly, day)
	if err != nil {
		return day
	}
	return t.Fmt.Day(d)
}

// Page is what the share page says.
type Page struct {
	Title, Reached, Made, Image string
}

// PageWords puts a milestone's words on its share page.
func PageWords(w Words, domain string) Page { return PageWordsIn(English, w, domain) }

// PageWordsIn is PageWords in a language.
func PageWordsIn(t *Tongue, w Words, domain string) Page {
	return Page{Title: fmt.Sprintf(t.PageTitle, w.Line(), domain), Reached: fmt.Sprintf(t.PageReached, w.Day), Made: t.PageMade}
}

// AlertLine is the milestone as an alert says it.
func AlertLine(w Words, domain string) (title, message string) {
	return words.alertTitle, fmt.Sprintf(English.PageTitle, w.Line(), domain) + ", " + fmt.Sprintf(English.PageReached, w.Day) + "."
}
