// Package say is how a number becomes words: counts, money, percents and
// changes in each language. It imports nothing of the product, so any package
// can use it; package summary builds on it.
package say

import (
	"math"
	"strconv"
	"strings"
)

// Where a currency sign goes.
const (
	moneyBefore = iota // $1,234
	moneyAfter         // 1.234 $
	moneySpaced        // $ 1.234
)

// FlatBelow is the size of a change, in percent, under which a number is said
// to be about the same.
const FlatBelow = 0.5

// Words writes numbers, money and changes in one language. English is the
// source: any language not listed is English.
type Words struct {
	Code     string
	group    string // between thousands
	decimal  string
	moneyAt  int
	Up, Down string // before the percent: "up 12%"
	Same     string // about the same
	New      string // there was nothing before
}

var langs = map[string]Words{
	"en": {Code: "en", group: ",", decimal: ".", moneyAt: moneyBefore, Up: "up", Down: "down", Same: "about the same", New: "new"},
	"de": {Code: "de", group: ".", decimal: ",", moneyAt: moneyAfter, Up: "plus", Down: "minus", Same: "ungefähr gleich", New: "neu"},
	"fr": {Code: "fr", group: "\u00a0", decimal: ",", moneyAt: moneyAfter, Up: "en hausse de", Down: "en baisse de", Same: "à peu près stable", New: "nouveau"},
	"es": {Code: "es", group: ".", decimal: ",", moneyAt: moneyAfter, Up: "sube", Down: "baja", Same: "casi igual", New: "nuevo"},
	"it": {Code: "it", group: ".", decimal: ",", moneyAt: moneyAfter, Up: "in aumento del", Down: "in calo del", Same: "più o meno uguale", New: "nuovo"},
	"nl": {Code: "nl", group: ".", decimal: ",", moneyAt: moneySpaced, Up: "omhoog", Down: "omlaag", Same: "ongeveer gelijk", New: "nieuw"},
}

// Langs are the languages with their own words, English first.
var Langs = []string{"en", "de", "fr", "es", "it", "nl"}

// For returns the words of a language; any other is English.
func For(lang string) Words {
	if w, ok := langs[strings.ToLower(strings.TrimSpace(lang))]; ok {
		return w
	}
	return langs["en"]
}

// Number groups the digits of n the way the language does: 1,234 / 1.234 / 1 234.
func (w Words) Number(n int64) string {
	s := strconv.FormatInt(n, 10)
	for i := len(s) - 3; i > 0 && s[i-1] != '-'; i -= 3 {
		s = s[:i] + w.group + s[i:]
	}
	return s
}

// Float is a number with the language's decimal mark (prec -1: as short as it goes).
func (w Words) Float(f float64, prec int) string {
	return strings.Replace(strconv.FormatFloat(f, 'f', prec, 64), ".", w.decimal, 1)
}

// Percent writes a share (0.25 is 25%) whole, or with one decimal below one tenth.
func (w Words) Percent(x float64) string {
	if x > 0 && x < 0.1 {
		return w.Float(x*100, 1) + "%"
	}
	return w.Float(x*100, 0) + "%"
}

var symbols = map[string]string{"USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥", "CHF": "CHF", "INR": "₹", "AUD": "A$", "CAD": "C$"}

// Money writes minor units as whole currency with its sign where the language
// puts it; a currency with no sign is its code after the number.
func (w Words) Money(minor int64, cur string, exp int) string {
	return w.sign(w.Number(int64(math.Round(float64(minor)/math.Pow10(exp)))), cur)
}

// MoneyFine is Money with its cents, for a small amount (money per visitor).
func (w Words) MoneyFine(minor float64, cur string, exp int) string {
	return w.sign(w.Float(minor/math.Pow10(exp), 2), cur)
}

// sign puts a currency's sign on a written number.
func (w Words) sign(num, cur string) string {
	cur = strings.ToUpper(cur)
	sym := symbols[cur]
	switch {
	case sym == "":
		return strings.TrimSpace(num + " " + cur)
	case w.moneyAt == moneyAfter:
		return num + "\u00a0" + sym
	case w.moneyAt == moneySpaced || cur == "CHF":
		return sym + "\u00a0" + num
	}
	return sym + num
}

// Move is how a number moved against the period before.
type Move struct {
	Pct   float64 // the size, in percent, never negative
	Dir   int     // above zero up, below down, zero about the same
	Fresh bool    // there was nothing before and there is something now
}

// Delta is how cur moved against prev: new when there was nothing before,
// the same within half a percent.
func Delta(cur, prev float64) Move {
	if prev <= 0 {
		return Move{Fresh: cur > 0}
	}
	d := (cur - prev) / prev * 100
	switch {
	case d >= FlatBelow:
		return Move{Pct: d, Dir: 1}
	case d <= -FlatBelow:
		return Move{Pct: -d, Dir: -1}
	}
	return Move{}
}

// Change says how cur moved against prev: "up 12%", "down 3%", "about the
// same", or "new" when there was nothing before.
func (w Words) Change(cur, prev float64) string { return w.Say(Delta(cur, prev)) }

// Say words a move.
func (w Words) Say(m Move) string {
	pct := strconv.FormatFloat(m.Pct, 'f', 0, 64)
	switch {
	case m.Fresh:
		return w.New
	case m.Dir == 0 || pct == "0":
		return w.Same // a change that rounds to 0% is flat, never "up 0%"
	case m.Dir > 0:
		return strings.TrimSpace(w.Up + " " + pct + "%")
	}
	return strings.TrimSpace(w.Down + " " + pct + "%")
}
