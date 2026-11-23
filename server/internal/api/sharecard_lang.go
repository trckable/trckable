package api

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/milestones"
	"github.com/trckable/trckable/server/internal/summary"
)

// cardLang is every word a share picture and its post say, and how it writes numbers, money and dates, in one
// language. English is the one every other falls back to; one file per language (sharecard_lang_xx.go), and a
// test holds each to every field of English, with the same placeholders.
type cardLang struct {
	code string
	// How numbers, money and days are written.
	months [12]string // short names
	dayDot string     // after the day of the month ("9." in German)
	// Words.
	visitors, pageviews, revenue, noVisits, counted    string
	oncePerDay                                         string // beside the people of a period over more than a day, on a site without cookies
	engaged, avgTime, topCountry                       string
	engagedVisits, statPageviews, statVisitors, bounce string
	topPage, topSource, statRevenue                    string
	gridTitle                                          map[string]string // by period
	listTitle                                          map[string]string // the list pictures, by t
	heroLabel                                          map[string]string // the hero pictures, by t
	// What changed.
	changedFew, changedFlat, changedMix, changedNew, changedRose, changedFell, changedMostly, changedLed string
	changedPeople, homePage, theHomePage, direct, changedTitle                                           string
	// The other pictures.
	searchTitle, searchBadge, searchClicks, searchImpressions, aiTitle, aiVisits, aiMentions, aiRequests, aiPerVisitor, aiTop, aiRequestsOf, goalsTitle, salesTitle, salesRevenue, salesOrders string
	noChanged, noSearch, noAI, noGoals, noSales, noMilestone, bestDay, noBestDay                                                                                                               string
	// Periods: the pill, how a post says it, what a change is against.
	last24, post24, postDays, postAll, postRange, since string
	lastDays, last12, post12                            string // "Last 30 days", "Last 12 months" and how a post says it
	prev24, prevDay, prevDays, vs                       string
	// A post.
	postBegun, postTopPage string
	// The milestone picture.
	ms milestones.Tongue
}

// cardLangs are the languages a picture speaks: the dashboard's.
var cardLangs = map[string]*cardLang{"en": cardEN, "de": cardDE, "es": cardES, "fr": cardFR, "it": cardIT, "nl": cardNL}

func init() {
	for _, l := range cardLangs {
		if l.code != "en" {
			l.ms.Fmt = cardFmt{l}
		}
	}
}

// cardFmt writes a milestone's counts, amounts and days the way its language does.
type cardFmt struct{ l *cardLang }

func (f cardFmt) Number(v float64) string { return f.l.number(int64(v)) }
func (f cardFmt) Amount(v float64, cur string) string {
	return f.l.money(int64(v), strings.ToUpper(cur), 0)
}
func (f cardFmt) Day(t time.Time) string { return f.l.shortDay(t, true) }

// cardWords is English, the language of any picture asked for in one it does not have.
var cardWords = cardEN

// cardLangOf is the language for a lang query value: English for anything unknown.
func cardLangOf(s string) *cardLang {
	if l, ok := cardLangs[strings.ToLower(strings.TrimSpace(s))]; ok {
		return l
	}
	return cardEN
}

// words are the shared words of this language: its numbers, money and changes.
func (l *cardLang) words() summary.Words { return summary.For(l.code) }

// number is a count with its language's grouping: 1,234 / 1.234 / 1 234.
func (l *cardLang) number(n int64) string { return l.words().Number(n) }

// float is a number with its language's decimal mark (prec -1: as short as it goes).
func (l *cardLang) float(f float64, prec int) string { return l.words().Float(f, prec) }

// signed is a change with its sign: +120, −45.
func (l *cardLang) signed(n int64) string {
	if n < 0 {
		return "−" + l.number(-n)
	}
	return "+" + l.number(n)
}

// times is a multiple the way the dashboard writes it: one decimal under ten, whole above, never a huge one.
func (l *cardLang) times(r float64) string {
	r = math.Min(r, changedTimes)
	if r >= 10 {
		return l.float(math.Round(r), 0) + "×"
	}
	return l.float(math.Round(r*10)/10, -1) + "×"
}

// money is an amount with its symbol where its language puts it; a currency with no symbol is its code after.
func (l *cardLang) money(minor int64, cur string, exp int) string {
	return l.words().Money(minor, cur, exp)
}

// shortCount says a large count briefly: 1.2M, 606K, 950.
func (l *cardLang) shortCount(n int64) string {
	switch {
	case n >= 10_000_000:
		return strconv.FormatInt(n/1_000_000, 10) + "M"
	case n >= 1_000_000:
		return l.float(float64(n)/1_000_000, 2) + "M"
	case n >= 10_000:
		return strconv.FormatInt(n/1000, 10) + "K"
	}
	return l.number(n)
}

// shortDay is a day as the pill writes it: "9 Oct", with the year when asked.
func (l *cardLang) shortDay(d time.Time, year bool) string {
	s := fmt.Sprintf("%d%s %s", d.Day(), l.dayDot, l.months[d.Month()-1])
	if year {
		s += fmt.Sprintf(" %d", d.Year())
	}
	return s
}

// datesLabel is a run of days in words: "9 Oct – 8 Nov 2026", the year said once when both ends are in it, and a
// single day on its own.
func (l *cardLang) datesLabel(from, to time.Time) string {
	switch {
	case from.Equal(to):
		return l.shortDay(to, true)
	case from.Year() == to.Year():
		return l.shortDay(from, false) + " – " + l.shortDay(to, true)
	}
	return l.shortDay(from, true) + " – " + l.shortDay(to, true)
}

// monthYear is "Nov 2026".
func (l *cardLang) monthYear(d time.Time) string {
	return fmt.Sprintf("%s %d", l.months[d.Month()-1], d.Year())
}
