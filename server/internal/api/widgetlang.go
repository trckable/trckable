package api

import (
	"embed"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// The words of a widget. Every visible label is a message in a per-language
// file (widgetlang/<code>.json, English the one every other falls back to),
// and an owner can replace a label with their own text. Both are only ever
// written into the page as text, which the page's template escapes: a label
// can hold no markup and no script, whatever it says.

//go:embed widgetlang/*.json
var widgetLangFS embed.FS

var (
	langOnce sync.Once
	langs    map[string]map[string]string
)

func loadLangs() {
	langs = map[string]map[string]string{}
	for code := range sqlite.WidgetLangs {
		b, err := widgetLangFS.ReadFile("widgetlang/" + code + ".json")
		if err != nil {
			continue // auto has no file
		}
		m := map[string]string{}
		if json.Unmarshal(b, &m) != nil {
			panic("widgetlang/" + code + ".json is not a message file")
		}
		langs[code] = m
	}
}

// widgetLang picks the language of a page: the widget's own, or for auto the
// first the visitor's browser asks for that we speak, by its main part
// ("de-CH" is German), highest weight first; English when none.
func widgetLang(set string, r *http.Request) string {
	if set != "" && set != "auto" {
		return set
	}
	type pick struct {
		code string
		q    float64
	}
	var picks []pick
	for _, part := range strings.Split(r.Header.Get("Accept-Language"), ",") {
		tag, params, _ := strings.Cut(strings.TrimSpace(part), ";")
		q := 1.0
		if k, v, ok := strings.Cut(strings.ReplaceAll(params, " ", ""), "="); ok && k == "q" {
			if f, err := strconv.ParseFloat(v, 64); err == nil {
				q = f
			}
		}
		main, _, _ := strings.Cut(strings.ToLower(tag), "-")
		if q > 0 && sqlite.WidgetLangs[main] && main != "auto" {
			picks = append(picks, pick{main, q})
		}
	}
	sort.SliceStable(picks, func(i, j int) bool { return picks[i].q > picks[j].q })
	if len(picks) > 0 {
		return picks[0].code
	}
	return "en"
}

// widgetWords reads messages in one language, with an owner's own texts over
// them.
type widgetWords struct {
	lang   string
	kind   string
	custom map[string]string
}

func newWidgetWords(lang string, wd sqlite.Widget) widgetWords {
	langOnce.Do(loadLangs)
	return widgetWords{lang: lang, kind: wd.Kind, custom: wd.Texts}
}

// msg is a message with {name} marks filled in. The owner's text for the
// label wins; the language's own comes next, then English.
func (w widgetWords) msg(key string, vars ...string) string {
	text := ""
	for ck, mk := range sqlite.WidgetTexts[w.kind] {
		if mk == key && w.custom[ck] != "" {
			text = w.custom[ck]
		}
	}
	if text == "" {
		text = w.plain(key)
	}
	return fillMarks(text, vars)
}

// plain is a message as the language has it, whatever the owner chose.
func (w widgetWords) plain(key string) string {
	if t, ok := langs[w.lang][key]; ok {
		return t
	}
	return langs["en"][key]
}

// plural picks a message's form for n and fills it in.
func (w widgetWords) plural(key string, n int64, vars ...string) string {
	return fillMarks(w.plain(key+"."+pluralForm(w.lang, n)), append([]string{"n", number(n)}, vars...))
}

// pluralForm is the CLDR plural category of a whole number in the languages
// widgets speak, which use only two of them for whole numbers: French and
// Portuguese count 0 and 1 as one, the rest only 1. (A page has no script, so
// there is no Intl.PluralRules to ask; these are its rules for these languages.)
func pluralForm(lang string, n int64) string {
	switch lang {
	case "fr", "pt":
		if n == 0 || n == 1 {
			return "one"
		}
	default:
		if n == 1 {
			return "one"
		}
	}
	return "other"
}

// fillMarks puts values into {name} marks: pairs of name, value. A mark with no
// value stays as written.
func fillMarks(text string, vars []string) string {
	if !strings.Contains(text, "{") {
		return text
	}
	for i := 0; i+1 < len(vars); i += 2 {
		text = strings.ReplaceAll(text, "{"+vars[i]+"}", vars[i+1])
	}
	return text
}
