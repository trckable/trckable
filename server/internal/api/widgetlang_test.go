package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

var marks = regexp.MustCompile(`\{[a-z]+\}`)

// Every language has every message English has, and the same {marks} in each:
// a gap would show an English label in the middle of German.
func TestWidgetLanguagesAreComplete(t *testing.T) {
	langOnce.Do(loadLangs)
	en := langs["en"]
	for code := range sqlite.WidgetLangs {
		if code == "auto" {
			continue
		}
		m, ok := langs[code]
		if !ok {
			t.Fatalf("no message file for %s", code)
		}
		for k, want := range en {
			got, ok := m[k]
			if !ok || got == "" {
				t.Errorf("%s misses %q", code, k)
				continue
			}
			a, b := marks.FindAllString(want, -1), marks.FindAllString(got, -1)
			slices.Sort(a)
			slices.Sort(b)
			if !slices.Equal(a, b) {
				t.Errorf("%s %q has marks %v, English has %v", code, k, b, a)
			}
		}
		if len(m) != len(en) {
			t.Errorf("%s has %d messages, English %d", code, len(m), len(en))
		}
	}
	// Every label an owner can reword is a message.
	for kind, keys := range sqlite.WidgetTexts {
		for ck, mk := range keys {
			if _, ok := en[mk]; !ok {
				t.Errorf("%s.%s rewords %q, which is no message", kind, ck, mk)
			}
		}
	}
}

func TestPluralForms(t *testing.T) {
	for _, tc := range []struct {
		lang string
		n    int64
		want string
	}{
		{"en", 0, "other"}, {"en", 1, "one"}, {"en", 2, "other"},
		{"de", 1, "one"}, {"de", 5, "other"},
		{"fr", 0, "one"}, {"fr", 1, "one"}, {"fr", 2, "other"},
		{"pt", 0, "one"}, {"pt", 2, "other"},
		{"es", 0, "other"}, {"it", 1, "one"}, {"nl", 3, "other"}, {"sq", 1, "one"}, {"sq", 2, "other"},
	} {
		if got := pluralForm(tc.lang, tc.n); got != tc.want {
			t.Errorf("%s %d: %s, want %s", tc.lang, tc.n, got, tc.want)
		}
	}
	w := newWidgetWords("de", sqlite.Widget{Kind: "live"})
	if got := w.plural("bar", 1, "time", "12:00"); got != "12:00 · 1 Besucher" {
		t.Errorf("one: %q", got)
	}
	w = newWidgetWords("en", sqlite.Widget{Kind: "live"})
	if one, many := w.plural("bar", 1, "time", "12:00"), w.plural("bar", 3, "time", "12:00"); one != "12:00 · 1 visitor" || many != "12:00 · 3 visitors" {
		t.Errorf("en: %q, %q", one, many)
	}
}

func TestWidgetLangFromTheBrowser(t *testing.T) {
	ask := func(set, header string) string {
		r := httptest.NewRequest(http.MethodGet, "/w/x", nil)
		if header != "" {
			r.Header.Set("Accept-Language", header)
		}
		return widgetLang(set, r)
	}
	for _, tc := range []struct{ set, header, want string }{
		{"auto", "de-CH,de;q=0.9,en;q=0.8", "de"},
		{"", "fr-FR", "fr"},
		{"auto", "en;q=0.5, sq;q=0.9", "sq"},
		{"auto", "xx, zz;q=0.5", "en"},
		{"auto", "de;q=0", "en"},
		{"auto", "*", "en"},
		{"auto", "", "en"},
		{"auto", "auto", "en"},
		{"it", "de", "it"}, // the widget's own choice wins
	} {
		if got := ask(tc.set, tc.header); got != tc.want {
			t.Errorf("%q with %q: %s, want %s", tc.set, tc.header, got, tc.want)
		}
	}
}

// A message missing in a language reads in English, and an owner's text
// replaces the default, with {n} filled in; empty keeps the default.
func TestWidgetWordsFallbackAndCustom(t *testing.T) {
	langOnce.Do(loadLangs)
	saved := langs["de"]["few"]
	delete(langs["de"], "few")
	defer func() { langs["de"]["few"] = saved }()
	if got := newWidgetWords("de", sqlite.Widget{Kind: "online"}).msg("few"); got != "A few" {
		t.Fatalf("fallback: %q", got)
	}
	w := newWidgetWords("de", sqlite.Widget{Kind: "counter", Texts: map[string]string{"now": "{n} hier"}})
	if got := w.msg("counter", "n", "7"); got != "7 hier" {
		t.Fatalf("custom: %q", got)
	}
	w = newWidgetWords("de", sqlite.Widget{Kind: "counter", Texts: map[string]string{}})
	if got := w.msg("counter", "n", "7"); got != "7 in den letzten 30 Min." {
		t.Fatalf("default: %q", got)
	}
	// A text of another design does not leak in.
	w = newWidgetWords("en", sqlite.Widget{Kind: "live", Texts: map[string]string{"now": "x"}})
	if got := w.msg("counter", "n", "7"); got != "7 in the last 30 min" {
		t.Fatalf("a key of another design: %q", got)
	}
}

// Language and wording are set per widget, kept as given within limits, and
// the page speaks them: in its own language or the visitor's, with the owner's
// words escaped.
func TestWidgetLanguageAndTextsOnThePage(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	for i := 0; i < 3; i++ {
		g.event(t, event.Event{Kind: event.KindPageview, EventID: uint64(i + 1), TS: g.now.Add(-time.Minute).UnixMilli(), Visitor: uint64(10 + i), Path: "/"})
	}
	g.waitApplied(t, 3)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/widgets"
	made := func(body string) (int, map[string]any) { return do(t, owner, "POST", base, body, csrf, "1") }

	if code, _ := made(`{"kind":"online","lang":"xx"}`); code != http.StatusBadRequest {
		t.Fatalf("a language we do not speak: %d", code)
	}
	if code, _ := made(`{"kind":"online","texts":{"online":"` + strings.Repeat("y", 41) + `"}}`); code != http.StatusBadRequest {
		t.Fatalf("a text over forty characters: %d", code)
	}
	code, out := made(`{"kind":"online","lang":"fr","texts":{"online":"  ici maintenant ","few":"","nope":"x","now":"x"}}`)
	if code != http.StatusCreated || toJSON(out["texts"]) != `{"online":"ici maintenant"}` || out["lang"] != "fr" {
		t.Fatalf("texts of this design only, trimmed, empty ones dropped: %d %v %v", code, out["texts"], out["lang"])
	}
	get := func(id, accept string) (string, http.Header) {
		req, _ := http.NewRequest(http.MethodGet, g.srv.URL+"/w/"+id, nil)
		if accept != "" {
			req.Header.Set("Accept-Language", accept)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		return string(b), res.Header
	}
	body, h := get(out["id"].(string), "de")
	if !strings.Contains(body, "3 ici maintenant") || !strings.Contains(body, `lang="fr"`) || !strings.Contains(body, "Compté par") || strings.Contains(strings.Join(h.Values("Vary"), ","), "Accept-Language") {
		t.Fatalf("a widget in French says so whatever the browser asks, with its own word: %s", body)
	}

	// Left on auto, it follows the visitor, and says so to caches.
	_, auto := made(`{"kind":"live","shows":["bars","pages"]}`)
	id := auto["id"].(string)
	body, h = get(id, "de-DE,de;q=0.9")
	for _, want := range []string{"Besucher in den letzten 30 Minuten", `lang="de"`, "Gezählt von", "0 Besucher"} {
		if !strings.Contains(body, want) {
			t.Fatalf("auto, German misses %q", want)
		}
	}
	if !strings.Contains(strings.Join(h.Values("Vary"), ","), "Accept-Language") || h.Get("Content-Language") != "de" {
		t.Fatalf("auto says so to caches: %v", h)
	}
	if body, _ = get(id, "fr"); !strings.Contains(body, "Visiteurs des 30 dernières minutes") || !strings.Contains(body, "3 visiteurs") {
		t.Fatalf("auto, French, with the plural: %s", body)
	}
	if body, _ = get(id, ""); !strings.Contains(body, "Visitors in the last 30 minutes") || !strings.Contains(body, "3 visitors") {
		t.Fatalf("auto with no preference is English: %s", body)
	}

	// The owner's words are text: markup in them is shown, never run.
	evil := `<script>alert(1)</script><img src=x onerror=alert(1)> & "q"`
	put := `{"kind":"live","shows":["bars"],"on":true,"texts":{"title":` + toJSON(evil[:40]) + `}}`
	if code, _ := do(t, owner, "PUT", base+"/"+id, put, csrf, "1"); code != http.StatusOK {
		t.Fatalf("edit: %d", code)
	}
	body, _ = get(id, "")
	if strings.Contains(body, "<script") || strings.Contains(body, "<img") || !strings.Contains(body, "&lt;script&gt;alert(1)&lt;/script&gt;") {
		t.Fatalf("an owner's text must be escaped: %s", body)
	}

	// The preview takes language and texts from the address.
	q := url.Values{"kind": {"counter"}, "lang": {"it"}, "text.now": {"{n} qui <b>ora</b>"}}
	res, err := owner.Get(g.srv.URL + "/api/v1/sites/" + g.site + "/widgets/preview?" + q.Encode())
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != http.StatusOK || !strings.Contains(string(b), "3 qui &lt;b&gt;ora&lt;/b&gt;") || !strings.Contains(string(b), "Contato da") {
		t.Fatalf("preview: %d %s", res.StatusCode, b)
	}
	if code, _ := do(t, owner, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/widgets/preview?kind=counter&lang=xx", ""); code != http.StatusBadRequest {
		t.Fatalf("preview in a language we do not speak: %d", code)
	}
}

// The privacy seal's lines are translated, never reworded: its texts are only
// the title and the footer.
func TestSealStatementsAreNotRewordable(t *testing.T) {
	for _, k := range []string{"p_noip", "p_never", "p_cookie"} {
		for kind, keys := range sqlite.WidgetTexts {
			for ck, mk := range keys {
				if mk == k {
					t.Errorf("%s.%s lets an owner reword a statement of the seal", kind, ck)
				}
			}
		}
	}
}
