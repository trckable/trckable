package api

import (
	"fmt"
	"os"
	"os/exec"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/cards"
	"github.com/trckable/trckable/server/internal/milestones"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

var verbs = regexp.MustCompile(`%[a-z]`)

// Every language has every word English has, with the same places for what is filled in, and the dashboard's
// languages are exactly the picture's.
func TestCardLangsAreComplete(t *testing.T) {
	en := reflect.ValueOf(*cardEN)
	for code, l := range cardLangs {
		if l.code != code {
			t.Errorf("%s is filed as %s", l.code, code)
		}
		v := reflect.ValueOf(*l)
		for i := 0; i < v.NumField(); i++ {
			name := v.Type().Field(i).Name
			switch f := v.Field(i); f.Kind() {
			case reflect.String:
				if f.String() == "" && name != "dayDot" {
					t.Errorf("%s: %s is empty", code, name)
				}
				if got, want := verbs.FindAllString(f.String(), -1), verbs.FindAllString(en.Field(i).String(), -1); !reflect.DeepEqual(got, want) {
					t.Errorf("%s: %s fills in %v, English %v", code, name, got, want)
				}
			case reflect.Struct:
				// The milestone words: each a word, with English's places to fill in.
				for j := 0; j < f.NumField(); j++ {
					if f.Field(j).Kind() != reflect.String {
						continue
					}
					if f.Field(j).String() == "" {
						t.Errorf("%s: %s.%s is empty", code, name, f.Type().Field(j).Name)
					}
					if got, want := verbs.FindAllString(f.Field(j).String(), -1), verbs.FindAllString(en.Field(i).Field(j).String(), -1); !reflect.DeepEqual(got, want) {
						t.Errorf("%s: %s.%s fills in %v, English %v", code, name, f.Type().Field(j).Name, got, want)
					}
				}
			case reflect.Map:
				keys := func(m reflect.Value) []string {
					var out []string
					for _, k := range m.MapKeys() {
						out = append(out, k.String())
						if m.MapIndex(k).String() == "" {
							t.Errorf("%s: %s[%s] is empty", code, name, k)
						}
					}
					sort.Strings(out)
					return out
				}
				if got, want := keys(f), keys(en.Field(i)); !reflect.DeepEqual(got, want) {
					t.Errorf("%s: %s has %v, English %v", code, name, got, want)
				}
			case reflect.Array:
				for j := 0; j < f.Len(); j++ {
					if f.Index(j).String() == "" {
						t.Errorf("%s: %s[%d] is empty", code, name, j)
					}
				}
			}
		}
	}
	// The dashboard's own list of languages.
	src, err := os.ReadFile("../../../dashboard/src/i18n/languages.ts")
	if err != nil {
		t.Skip("no dashboard next to the server")
	}
	var want []string
	for _, m := range regexp.MustCompile(`code: '(\w\w)'`).FindAllStringSubmatch(string(src), -1) {
		want = append(want, m[1])
	}
	var got []string
	for code := range cardLangs {
		got = append(got, code)
	}
	sort.Strings(got)
	sort.Strings(want)
	if !reflect.DeepEqual(got, want) {
		t.Errorf("the pictures speak %v, the dashboard %v", got, want)
	}
}

// Every list and hero picture has its words, and a lang that is not one of ours is English.
func TestCardLangOf(t *testing.T) {
	for code, l := range cardLangs {
		for tpl := range cardLists {
			if l.listTitle[tpl] == "" {
				t.Errorf("%s: no title for %s", code, tpl)
			}
		}
		for tpl := range cardHeroes {
			if l.heroLabel[tpl] == "" {
				t.Errorf("%s: no label for %s", code, tpl)
			}
		}
		for _, p := range []string{"24h", "7d", "30d", "all", "custom"} {
			if l.gridTitle[p] == "" {
				t.Errorf("%s: no grid title for %s", code, p)
			}
		}
	}
	for in, want := range map[string]string{"": "en", "de": "de", "DE": "de", " fr ": "fr", "xx": "en", "de-AT": "en", "../etc": "en"} {
		if got := cardLangOf(in).code; got != want {
			t.Errorf("lang %q is %s, want %s", in, got, want)
		}
	}
}

// Numbers, money and days are written the way the language writes them.
func TestCardLangFormats(t *testing.T) {
	day := time.Date(2026, 10, 9, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 11, 8, 0, 0, 0, 0, time.UTC)
	for _, c := range []struct {
		code, num, money, signed, dates, times, per string
	}{
		{"en", "1,234,567", "$1,235", "−1,200", "9 Oct – 8 Nov 2026", "2.5×", "1.5"},
		{"de", "1.234.567", "1.235 $", "−1.200", "9. Okt – 8. Nov 2026", "2,5×", "1,5"},
		{"fr", "1 234 567", "1 235 $", "−1 200", "9 oct. – 8 nov. 2026", "2,5×", "1,5"},
		{"es", "1.234.567", "1.235 $", "−1.200", "9 oct – 8 nov 2026", "2,5×", "1,5"},
		{"it", "1.234.567", "1.235 $", "−1.200", "9 ott – 8 nov 2026", "2,5×", "1,5"},
		{"nl", "1.234.567", "$ 1.235", "−1.200", "9 okt – 8 nov 2026", "2,5×", "1,5"},
	} {
		l := cardLangOf(c.code)
		if got := l.number(1234567); got != c.num {
			t.Errorf("%s number %q, want %q", c.code, got, c.num)
		}
		if got := l.number(-1234); !strings.HasPrefix(got, "-") || strings.HasPrefix(got, "-"+l.words().Number(1)[:0]+"-") {
			t.Errorf("%s negative %q", c.code, got)
		}
		if got := l.money(123456, "USD", 2); got != c.money {
			t.Errorf("%s money %q, want %q", c.code, got, c.money)
		}
		if got := l.signed(-1200); got != c.signed {
			t.Errorf("%s signed %q, want %q", c.code, got, c.signed)
		}
		if got := l.datesLabel(day, end); got != c.dates {
			t.Errorf("%s dates %q, want %q", c.code, got, c.dates)
		}
		if got := l.times(2.46); got != c.times {
			t.Errorf("%s times %q, want %q", c.code, got, c.times)
		}
		if got := l.float(1.5, 1); got != c.per {
			t.Errorf("%s float %q, want %q", c.code, got, c.per)
		}
	}
}

// A German name, a French place: the country and the home page come in the picture's language.
func TestCardLangCountries(t *testing.T) {
	for code, want := range map[string]string{"en": "Germany", "de": "Deutschland", "fr": "Allemagne", "es": "Alemania", "it": "Germania", "nl": "Duitsland"} {
		if got := countryName(cardLangOf(code), "DE"); got != want {
			t.Errorf("%s: %q, want %q", code, got, want)
		}
	}
	if got := countryName(cardLangOf("de"), "XX"); got != "" {
		t.Errorf("an unknown code is %q", got)
	}
}

// A sentence in another language says what the English one does.
func TestCardLangSentences(t *testing.T) {
	cur := visitorsResult(300, map[string][]query.Row{"referrer": {{Value: "news.ycombinator.com", Visitors: 200}, {Value: "google.com", Visitors: 100}}})
	prev := visitorsResult(100, map[string][]query.Row{"referrer": {{Value: "google.com", Visitors: 90}, {Value: "news.ycombinator.com", Visitors: 10}}})
	if got := explainChange(cardDE, cur, prev).say; got != "Besucher stiegen um 3×, vor allem durch news.ycombinator.com." {
		t.Errorf("de: %q", got)
	}
	if got := explainChange(cardFR, cur, prev).say; got != "Personnes en hausse de 3×, surtout grâce à news.ycombinator.com." {
		t.Errorf("fr: %q", got)
	}
	now := time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)
	made := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	p := resolvePeriod(cardDE, "30d", "", "", now, made, true)
	if p.post != "in den letzten 30 Tagen" || p.vs != "vorherige 30 Tage" || p.label != "12. Okt – 10. Nov 2026" {
		t.Errorf("de period: %+v", p)
	}
	if p := resolvePeriod(cardFR, "all", "", "", now, made, true); p.label != "Depuis janv. 2026" || p.vs != "" {
		t.Errorf("fr all time: %+v", p)
	}
	if p := resolvePeriod(cardNL, "24h", "", "", now, made, true); p.label != "Laatste 24 uur" || p.vs != "voorgaande 24 uur" {
		t.Errorf("nl 24h: %+v", p)
	}
}

// spokenSpecs are the pictures as a language's words make them, with the busiest numbers: what each template draws
// with a title, a label under the number, small numbers with their labels, lines and a foot.
func spokenSpecs(l *cardLang, format, theme string) []cards.Spec {
	_, th := cards.ThemeOf(theme)
	base := cards.Spec{Format: format, Theme: th, Lang: l.code, Domain: "a-very-long-domain-name.example.com"}
	foot := l.datesLabel(time.Date(2026, 10, 12, 0, 0, 0, 0, time.UTC), time.Date(2026, 11, 9, 0, 0, 0, 0, time.UTC))
	change := "+124% " + l.vs + " " + strings.Replace(l.prevDays, "%d", "30", 1)
	big := l.number(1234567)
	stats := []cards.Stat{
		{Value: l.number(83), Label: l.engaged}, {Value: "12m 14s", Label: l.avgTime},
		{Value: countryName(l, "GB"), Label: l.topCountry, Flag: "gb"}, {Value: "/pricing/team", Label: l.topPage},
		{Value: "news.ycombinator.com", Label: l.topSource}, {Value: l.money(123456789, "EUR", 2), Label: l.statRevenue},
		{Value: "83%", Label: l.bounce}, {Value: l.number(99999), Label: l.statPageviews},
	}
	row := func(n string) cards.Item { return cards.Item{Name: n, Value: l.signed(12345), Share: 0.8} }
	var out []cards.Spec
	add := func(s cards.Spec) {
		s.Format, s.Theme, s.Lang, s.Domain = base.Format, base.Theme, base.Lang, base.Domain
		out = append(out, s)
	}
	for _, label := range []string{l.visitors, l.pageviews, l.revenue, l.engagedVisits} {
		add(cards.Spec{Template: "overview", Big: big, Label: label, Foot: foot, Change: change, Dir: 1, Series: []float64{3, 8, 5, 9, 14, 11, 18}, Stats: stats[:3]})
		add(cards.Spec{Template: "numbers", Big: big, Label: label, Foot: foot, Change: change, Dir: 1, Stats: stats[3:6]})
	}
	add(cards.Spec{Template: "overview", Big: l.noVisits, Foot: foot})
	for _, p := range []string{"24h", "7d", "30d", "all", "custom"} {
		add(cards.Spec{Template: "grid", Label: l.gridTitle[p], Foot: foot, Stats: stats[:4]})
	}
	for t := range cardLists {
		add(cards.Spec{Template: "leaderboard", Label: l.listTitle[t], Foot: foot, Big: l.noVisits, Rows: []cards.Item{row("/"), row("/pricing/team/enterprise/with/a/very/long/path"), row(l.homePage), row(l.direct), row(countryName(l, "GB"))}})
	}
	for t := range cardHeroes {
		add(cards.Spec{Template: "spotlight", Label: l.heroLabel[t], Big: "news.ycombinator.com", Foot: foot})
		add(cards.Spec{Template: "spotlight", Label: l.heroLabel[t], Big: l.noVisits, Foot: foot})
	}
	add(cards.Spec{Template: "spotlight", Big: l.noMilestone, Foot: foot})
	digests := []struct {
		title string
		empty string
	}{{l.changedTitle, l.noChanged}, {l.searchTitle, l.noSearch}, {l.aiTitle, l.noAI}, {l.goalsTitle, l.noGoals}, {l.salesTitle, l.noSales}}
	for _, d := range digests {
		add(cards.Spec{Template: "digest", Label: d.title, Big: d.empty, Foot: foot})
		add(cards.Spec{Template: "digest", Label: d.title, Big: d.empty, Foot: foot, Badge: l.searchBadge})
		add(cards.Spec{Template: "digest", Label: d.title, Foot: foot, Stats: []cards.Stat{
			{Value: l.shortCount(1234567), Label: l.aiRequests}, {Value: l.float(12.5, 1) + "×", Label: l.aiPerVisitor},
			{Value: "Anthropic", Label: l.aiTop + " · " + l.shortCount(606000) + " " + l.aiRequestsOf}, {Value: l.number(12345), Label: l.aiVisits},
		}, Rows: []cards.Item{row("news.ycombinator.com"), row(l.homePage), row(l.direct)}})
	}
	// What changed puts its sentence in the title.
	cur := visitorsResult(300, map[string][]query.Row{"referrer": {{Value: "news.ycombinator.com", Visitors: 200}}, "entry_page": {{Value: "/", Visitors: 100}}})
	prev := visitorsResult(100, map[string][]query.Row{"referrer": {{Value: "news.ycombinator.com", Visitors: 10}}, "entry_page": {{Value: "/", Visitors: 90}}})
	say := explainChange(l, cur, prev).say
	add(cards.Spec{Template: "digest", Label: say, Foot: foot, Stats: stats[:4], Rows: changeRows(l, biggestChanges(cur, prev))})
	add(cards.Spec{Template: "digest", Label: l.changedFew, Foot: foot})
	add(cards.Spec{Template: "digest", Label: l.changedMix, Foot: foot})
	return out
}

// Every picture in every language fits every format: no line leaves the margins, and each draws.
func TestCardLangsFitEveryFormat(t *testing.T) {
	for code, l := range cardLangs {
		for _, f := range cards.Formats {
			for _, theme := range []string{"dark", "light"} {
				for _, s := range spokenSpecs(l, f.ID, theme) {
					for _, o := range s.Overflows() {
						t.Errorf("%s %s: %s", code, theme, o)
					}
					if _, err := s.SVG(); err != nil {
						t.Errorf("%s %s %s: %v", code, f.ID, s.Template, err)
					}
				}
			}
		}
	}
}

// A picture asked for in another language is another picture, and its post says so in its words; a lang that is
// not one of ours is English.
func TestCardRouteLang(t *testing.T) {
	g := newRig(t)
	noOutbound(t, g)
	owner := client()
	g.setup(t, owner)
	card := g.srv.URL + "/api/v1/sites/" + g.site + "/card"
	_, _, en := get(t, owner, card+"?format=json&period=30d")
	_, _, de := get(t, owner, card+"?format=json&period=30d&lang=de")
	_, _, xx := get(t, owner, card+"?format=json&period=30d&lang=xx")
	if !strings.Contains(en, "Counted with trckable") || !strings.Contains(de, "Zählen") || strings.Contains(de, "Counted") {
		t.Errorf("post in German: %s", de)
	}
	if xx != en {
		t.Errorf("an unknown lang is not English: %s", xx)
	}
	for _, tpl := range []string{"overview", "leaderboard", "grid", "changed", "goals"} {
		_, _, a := get(t, owner, card+"?t="+tpl+"&period=30d")
		_, _, b := get(t, owner, card+"?t="+tpl+"&period=30d&lang=de")
		_, _, c := get(t, owner, card+"?t="+tpl+"&period=30d&lang=fr")
		if !strings.HasPrefix(b, "\x89PNG") || a == b || b == c {
			t.Errorf("%s: the pictures in en, de and fr must be three pictures", tpl)
		}
	}
}

// The milestone card speaks the picture's language: the number, the words, the amount and the day.
func TestCardLangMilestone(t *testing.T) {
	m := sqlite.Milestone{Kind: milestones.Visitors, Value: 10000, Day: "2026-09-21"}
	for code, want := range map[string][3]string{
		"en": {"10,000", "visitors", "Sep 21, 2026"},
		"de": {"10.000", "Besucher", "21. Sep 2026"},
		"fr": {"10\u00a0000", "visiteurs", "21 sept. 2026"},
	} {
		l := cardLangOf(code)
		s := milestones.CardIn(&l.ms, m, "", "demo.trckable.com", "light", false)
		if s.Big != want[0] || s.Label != want[1] || s.Foot != want[2] {
			t.Errorf("%s: %q %q %q", code, s.Big, s.Label, s.Foot)
		}
	}
	rev := sqlite.Milestone{Kind: milestones.Revenue, Value: 1000, Currency: "EUR", Day: "2026-09-21"}
	if got := milestones.SayIn(&cardDE.ms, rev, true).Line(); got != "1.000\u00a0€ Umsatz" {
		t.Errorf("de revenue %q", got)
	}
	if got := milestones.SayIn(&cardDE.ms, rev, false).Line(); got != "Umsatz Meilenstein" {
		t.Errorf("de hidden revenue %q", got)
	}
	// Every language's milestone cards fit every format.
	for code, l := range cardLangs {
		for _, f := range cards.Formats {
			for _, k := range []string{milestones.Visitors, milestones.Revenue, milestones.SearchClicks, milestones.AIVisits, milestones.RecordDay, milestones.FirstSale} {
				s := milestones.CardIn(&l.ms, sqlite.Milestone{Kind: k, Value: 1234567, Currency: "EUR", Day: "2026-09-21"}, fmt.Sprintf(l.ms.AfterSale, 12), "a-very-long-domain-name.example.com", "light", true)
				s.Format = f.ID
				for _, o := range s.Overflows() {
					t.Errorf("%s %s: %s", code, k, o)
				}
			}
		}
	}
}

// The countries people come from have a name in every language but English, and the table is the one the generator writes from the
// dashboard's languages (skipped where node is not installed).
func TestCardCountryNamesAreGenerated(t *testing.T) {
	for code := range cardLangs {
		if code == "en" {
			continue
		}
		// Old codes with no current country (CT, PU, ...) fall back to English; the real ones have a name.
		for _, c := range []string{"DE", "FR", "US", "GB", "JP", "BR", "IN", "AU", "CH", "NL", "ES", "IT"} {
			if countryNamesIn[code][c] == "" {
				t.Errorf("%s: no name for %s", code, c)
			}
		}
	}
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("no node")
	}
	if out, err := exec.Command(node, "../../../scripts/gen-country-names.mjs", "--check").CombinedOutput(); err != nil { //nolint:gosec // node from LookPath, a fixed script
		t.Errorf("%s", out)
	}
}
