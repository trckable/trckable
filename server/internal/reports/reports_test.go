package reports

import (
	"bytes"
	"compress/zlib"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/query"
)

func sample(lang string) Data {
	rev := int64(12000)
	_ = rev
	cur := &query.Result{
		KPIs:   query.KPIs{Visitors: 1284, Pageviews: 3050, BounceRate: 0.42, AvgSessionS: 83},
		Series: []query.Point{{Visitors: 100}, {Visitors: 220}, {Visitors: 180}, {Visitors: 0}, {Visitors: 300}, {Visitors: 250}, {Visitors: 234}},
		Dims: map[string][]query.Row{
			"channel":    {{Value: "Direct", Visitors: 600}, {Value: "AI", Visitors: 128}, {Value: "<script>alert(1)</script>", Visitors: 5}},
			"entry_page": {{Value: "/pricing", Visitors: 400}, {Value: "/", Visitors: 300}},
		},
		Goals: []query.Row{{Value: "Signed up", Visitors: 40}},
		Money: &query.Money{Currency: "EUR", Exponent: 2, Revenue: 129900, Payments: 3},
	}
	prev := &query.Result{KPIs: query.KPIs{Visitors: 1000, Pageviews: 3050}, Money: &query.Money{Currency: "EUR", Exponent: 2, Revenue: 100000, Payments: 2}}
	from := time.Date(2026, 9, 21, 0, 0, 0, 0, time.UTC)
	return Data{Site: "acme.com", Client: `Acme "Co" & <b>`, Cadence: "weekly", Lang: lang, From: from, To: from.AddDate(0, 0, 7), Cur: cur, Prev: prev,
		Brand: Brand{Name: "Acme Reports", Color: "#336699"}, Unsubscribe: "https://dash.example.com/r/abc?x=1&y=2"}
}

// Every language says every sentence: a missing one would be a blank in an email.
func TestEveryLanguageHasEveryWord(t *testing.T) {
	for _, lang := range Langs {
		w := For(lang)
		v := reflect.ValueOf(w)
		for i := 0; i < v.NumField(); i++ {
			f := v.Field(i)
			switch f.Kind() {
			case reflect.String:
				if f.String() == "" {
					t.Errorf("%s: %s is empty", lang, v.Type().Field(i).Name)
				}
			case reflect.Array:
				for j := 0; j < f.Len(); j++ {
					if f.Index(j).String() == "" {
						t.Errorf("%s: month %d is empty", lang, j)
					}
				}
			case reflect.Func:
				if f.IsNil() {
					t.Errorf("%s: no date format", lang)
				}
			}
		}
		for _, s := range []string{w.StopBody, w.Stopped, w.SentBy} {
			if strings.Count(s, "%s") != 1 {
				t.Errorf("%s: %q wants exactly one %%s", lang, s)
			}
		}
	}
	if len(Langs) != 6 {
		t.Errorf("the languages: %v", Langs)
	}
}

func TestNumbersAndDatesFollowTheLanguage(t *testing.T) {
	d := time.Date(2026, 3, 5, 0, 0, 0, 0, time.UTC)
	for lang, want := range map[string]string{"en": "Mar 5", "de": "5. Mär", "fr": "5 mars", "nl": "5 mrt"} {
		if got := For(lang).Date(d); got != want {
			t.Errorf("%s date: %q, want %q", lang, got, want)
		}
	}
	if got := For("de").Number(1234567); got != "1.234.567" {
		t.Errorf("de number: %s", got)
	}
	if got := For("en").Number(-1234); got != "-1,234" {
		t.Errorf("en number: %s", got)
	}
	if got := For("xx").Weekly; got != "Weekly report" {
		t.Errorf("an unknown language is English: %q", got)
	}
	if got := For("en").Change(120, 100); got != "up 20%" {
		t.Errorf("change: %q", got)
	}
	if got := For("en").Change(5, 0); got != "new" {
		t.Errorf("change from nothing: %q", got)
	}
	if got := For("en").Money(129900, "EUR", 2); got != "€1,299" {
		t.Errorf("money: %q", got)
	}
}

// What came from outside is escaped, and the report is in its client's words
// and look.
func TestHTMLIsEscapedBrandedAndTranslated(t *testing.T) {
	d := sample("de")
	out := HTML(d)
	for _, bad := range []string{"<script>", `Acme "Co" & <b>`} {
		if strings.Contains(out, bad) {
			t.Errorf("unescaped %q in the email", bad)
		}
	}
	for _, want := range []string{"Wochenbericht", "Besucher", "KI-Assistenten", "&lt;script&gt;", "1.284", "#336699", "gegenüber der Vorwoche", "Diesen Bericht abbestellen", "x=1&amp;y=2", "21. Sep – 27. Sep", "Gesendet von trckable"} {
		if !strings.Contains(out, want) {
			t.Errorf("the email lacks %q", want)
		}
	}
	if strings.Contains(out, "cid:") {
		t.Error("an inline logo without a logo")
	}
	d.Brand.Logo, d.Brand.HideBrand = []byte{1}, true
	out = HTML(d)
	if !strings.Contains(out, "cid:"+LogoCID) || strings.Contains(out, "trckable") {
		t.Errorf("a logo, and trckable's name hidden:\n%s", out)
	}
	if empty := sample("en"); true {
		empty.Cur = &query.Result{}
		if !strings.Contains(HTML(empty), "No visitors arrived") {
			t.Error("an empty period says so")
		}
	}
	txt := Text(sample("fr"))
	if !strings.Contains(txt, "Rapport hebdomadaire") || !strings.Contains(txt, "Ne plus recevoir ce rapport: https://dash.example.com/r/abc") || !strings.Contains(txt, "Assistants IA") {
		t.Errorf("the text twin:\n%s", txt)
	}
}

func TestMonthlyTitleAndSubject(t *testing.T) {
	d := sample("es")
	d.Cadence = "monthly"
	if d.Title() != "Informe mensual" || !strings.HasPrefix(d.Subject(), "Informe mensual · acme.com · ") || d.Against() != "respecto al mes anterior" {
		t.Errorf("%q %q %q", d.Title(), d.Subject(), d.Against())
	}
}

// pdfObjects reads a PDF the way a reader does: the start of the xref table
// from the end, then every object where the table says it is.
func pdfObjects(t *testing.T, b []byte) map[int]string {
	t.Helper()
	if !bytes.HasPrefix(b, []byte("%PDF-1.4")) || !bytes.HasSuffix(b, []byte("%%EOF\n")) {
		t.Fatal("not a PDF")
	}
	m := regexp.MustCompile(`startxref\n(\d+)\n%%EOF`).FindSubmatch(b)
	if m == nil {
		t.Fatal("no startxref")
	}
	at, _ := strconv.Atoi(string(m[1]))
	if !bytes.HasPrefix(b[at:], []byte("xref\n0 ")) {
		t.Fatalf("startxref points at %q", b[at:at+10])
	}
	lines := strings.Split(string(b[at:]), "\n")
	var n int
	if _, err := fmt.Sscanf(lines[1], "0 %d", &n); err != nil {
		t.Fatal(err)
	}
	objs := map[int]string{}
	for i := 1; i < n; i++ {
		off, _ := strconv.Atoi(strings.Fields(lines[2+i])[0])
		head := fmt.Sprintf("%d 0 obj\n", i)
		if !bytes.HasPrefix(b[off:], []byte(head)) {
			t.Fatalf("object %d is not at %d", i, off)
		}
		end := bytes.Index(b[off:], []byte("\nendobj\n"))
		objs[i] = string(b[off+len(head) : off+end])
	}
	return objs
}

func content(t *testing.T, objs map[int]string) string {
	t.Helper()
	body := objs[4]
	i := strings.Index(body, "stream\n")
	zr, err := zlib.NewReader(strings.NewReader(body[i+7 : strings.LastIndex(body, "\nendstream")]))
	if err != nil {
		t.Fatal(err)
	}
	out, _ := io.ReadAll(zr)
	return string(out)
}

func TestPDFIsAValidOnePageDocumentWithTheReport(t *testing.T) {
	d := sample("de")
	objs := pdfObjects(t, PDF(d))
	if !strings.Contains(objs[2], "/Count 1") || !strings.Contains(objs[5], "Helvetica") {
		t.Errorf("pages and fonts: %q %q", objs[2], objs[5])
	}
	if strings.Contains(objs[3], "/XObject") {
		t.Error("a picture without a logo")
	}
	c := content(t, objs)
	for _, want := range []string{"WOCHENBERICHT", "1.284", "Besucher pro Tag", "Top-Quellen", "(gegen\xfcber der Vorwoche)", "/F2", "0.200 0.400 0.600 rg"} {
		if !strings.Contains(c, want) && !strings.Contains(c, strings.ToUpper(want)) {
			t.Errorf("the page lacks %q:\n%s", want, c)
		}
	}
	if strings.Contains(c, "<script>") == false && !strings.Contains(c, "script") {
		t.Error("a source's name is missing")
	}
	// The foot says who sent it, unless that is hidden.
	if !strings.Contains(c, "Gesendet von trckable") {
		t.Error("no foot")
	}
	d.Brand.HideBrand = true
	if strings.Contains(content(t, pdfObjects(t, PDF(d))), "trckable") {
		t.Error("trckable's name was not hidden")
	}
}

func TestPDFEmbedsAPNGLogoAndEscapesText(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 40, 10))
	for x := 0; x < 40; x++ {
		for y := 0; y < 10; y++ {
			img.Set(x, y, color.NRGBA{200, 30, 30, 255})
		}
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	d := sample("en")
	d.Brand.Logo, d.Brand.LogoType = buf.Bytes(), "image/png"
	d.Client = `A (b) \ c — “d” € 日本`
	objs := pdfObjects(t, PDF(d))
	if !strings.Contains(objs[3], "/Im1 8 0 R") || !strings.Contains(objs[8], "/Width 40 /Height 10") || !strings.Contains(objs[8], "/FlateDecode") {
		t.Errorf("the logo: %q / %.120q", objs[3], objs[8])
	}
	c := content(t, objs)
	if !strings.Contains(c, `(A \(b\) \\ c \x97 \x93d\x94 \x80 ??)`) && !strings.Contains(c, "A \\(b\\) \\\\ c \x97 \x93d\x94 \x80 ??") {
		t.Errorf("the client's name, escaped and in WinAnsi:\n%q", c)
	}
	// A picture that cannot be read is no logo, not a broken file.
	d.Brand.Logo = []byte("not a picture")
	pdfObjects(t, PDF(d))
	d.Brand.Logo = nil
	d.Cur = &query.Result{}
	pdfObjects(t, PDF(d))
}

func TestFitCutsWithAnEllipsis(t *testing.T) {
	long := strings.Repeat("W", 80)
	got := fit(regular, 10, long, 100)
	if !strings.HasSuffix(got, "…") || width(regular, 10, got) > 100 {
		t.Errorf("fit: %q (%.0f wide)", got, width(regular, 10, got))
	}
	if fit(regular, 10, "short", 100) != "short" {
		t.Error("a short text was cut")
	}
	if Ink("#ffee00") != "#111111" || Ink("#112233") != "#ffffff" || Ink("nope") != "#ffffff" {
		t.Error("ink")
	}
}
