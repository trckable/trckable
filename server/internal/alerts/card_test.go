package alerts

import (
	"bytes"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"strings"
	"testing"
)

// parts reads a delivered message: its headers (Subject decoded), and the
// decoded text and HTML parts.
func parts(t *testing.T, raw string) (subject, text, page string, hdr mail.Header) {
	t.Helper()
	msg, err := mail.ReadMessage(strings.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	subject, _ = new(mime.WordDecoder).DecodeHeader(msg.Header.Get("Subject"))
	var walk func(ct, boundaryBody string, r io.Reader)
	walk = func(ct, _ string, r io.Reader) {
		typ, params, _ := mime.ParseMediaType(ct)
		if strings.HasPrefix(typ, "multipart/") {
			mr := multipart.NewReader(r, params["boundary"])
			for {
				p, err := mr.NextPart()
				if err != nil {
					return
				}
				walk(p.Header.Get("Content-Type"), "", quotedprintable.NewReader(p))
			}
		}
		var b bytes.Buffer
		_, _ = io.Copy(&b, r)
		switch typ {
		case "text/plain":
			text = b.String()
		case "text/html":
			page = b.String()
		}
	}
	walk(msg.Header.Get("Content-Type"), "", msg.Body)
	return subject, text, page, msg.Header
}

func TestShortKeepsTheEnd(t *testing.T) {
	if got := Short("/short", 30); got != "/short" {
		t.Fatalf("%q", got)
	}
	got := Short("/blog/kualifikimi-i-mesuesve-2025-ëëë", 20)
	if got != "…i-mesuesve-2025-ëëë" || len([]rune(got)) != 20 {
		t.Fatalf("%q", got)
	}
}

func TestCardEscapesEverythingAndKeepsLinksSafe(t *testing.T) {
	c := Card{
		Eyebrow: "<b>x</b>", Big: `5 "people"`, Strong: "1.9×", Sub: "<i>usual</i>", Text: "a<script>\nb",
		Rows: [][2]string{{"Top page", "/" + strings.Repeat("a", 60) + "<end>"}},
		CTA:  "Open Live →", Link: `https://stats.example.com/x?a=1&b="2"`,
	}
	h := c.HTML("javascript:alert(1)", "https://stats.example.com/settings?site=s&tab=alerts")
	for _, bad := range []string{"<b>x</b>", "<i>usual</i>", "<script>", "javascript:", "<end>"} {
		if strings.Contains(h, bad) {
			t.Errorf("unescaped %q", bad)
		}
	}
	for _, want := range []string{"&lt;b&gt;x&lt;/b&gt;", "&#34;people&#34;", "…", "&lt;end&gt;", "a&lt;script&gt;<br>b",
		`href="https://stats.example.com/x?a=1&amp;b=&#34;2&#34;"`, "Open Live →", "settings?site=s&amp;tab=alerts", "Alert settings",
		"prefers-color-scheme: dark", "color-scheme", "max-width:600px"} {
		if !strings.Contains(h, want) {
			t.Errorf("missing %q", want)
		}
	}
	if strings.Contains(h, "Stop these alerts") {
		t.Error("an unsafe stop link was drawn")
	}
	if strings.Contains(h, "<link") || strings.Contains(h, "@import") || strings.Contains(h, `src="http`) {
		t.Error("an external resource")
	}
}

func TestEmailCarriesTextAndHTML(t *testing.T) {
	addr, got := fakeSMTP(t)
	m, err := ParseMailer("smtp://"+addr, "trckable@example.com")
	if err != nil {
		t.Fatal(err)
	}
	e := Event{Kind: "surge", Domain: "x.com", Title: "Your site is having a moment", Subject: "x.com is having a moment",
		Message: "Right now 27 people are on x.com.\n\nhttps://stats.example.com/x.com", Unsubscribe: "https://stats.example.com/u/a.sig",
		Settings: "https://stats.example.com/settings?site=s&tab=alerts",
		Card:     &Card{Big: "27 people", CTA: "Open Live →", Link: "https://stats.example.com/x.com", Rows: [][2]string{{"Top page", "/a/<b>"}}}}
	if err := m.send(t.Context(), "me@example.com", e); err != nil {
		t.Fatal(err)
	}
	raw := <-got
	subject, text, page, hdr := parts(t, raw)
	if subject != "x.com is having a moment" || hdr.Get("List-Unsubscribe") != "<https://stats.example.com/u/a.sig>" {
		t.Errorf("subject %q headers %v", subject, hdr)
	}
	for _, want := range []string{"Right now 27 people are on x.com.", "https://stats.example.com/x.com", "Stop this email: https://stats.example.com/u/a.sig"} {
		if !strings.Contains(text, want) {
			t.Errorf("text misses %q:\n%s", want, text)
		}
	}
	for _, want := range []string{"27 people", "/a/&lt;b&gt;", "Open Live →", "https://stats.example.com/u/a.sig", "settings?site=s&amp;tab=alerts"} {
		if !strings.Contains(page, want) {
			t.Errorf("html misses %q", want)
		}
	}
	if strings.Index(raw, "text/plain") > strings.Index(raw, "text/html") {
		t.Error("the text must come first")
	}
}

func TestCardShowsTheAskLinkOnlyWhenItIsSafeAndSet(t *testing.T) {
	c := Card{Big: "Tracking stopped", Ask: "https://stats.example.com/shop.example?peek=stopped&at=1760000000"}
	h := c.HTML("https://stats.example.com/u/t", "")
	for _, want := range []string{"Open in dashboard", `shop.example?peek=stopped&amp;at=1760000000`} {
		if !strings.Contains(h, want) {
			t.Errorf("missing %q", want)
		}
	}
	if strings.Contains(Card{Big: "x"}.HTML("", ""), "Open in dashboard") {
		t.Error("a link was drawn with none set")
	}
	if strings.Contains(Card{Big: "x", Ask: "javascript:alert(1)"}.HTML("", ""), "javascript:") {
		t.Error("an unsafe ask link was drawn")
	}
}

func TestCardKeepsMailClientsFromLinkingDomainsAndDates(t *testing.T) {
	c := Card{Site: "shop.example", Eyebrow: "Milestone reached", Big: "10,000", Unit: "pageviews", Sub: "Reached on 15 Oct 2026",
		CTA: "Open shop.example", Link: "https://stats.example.com/shop.example"}
	h := c.HTML("https://stats.example.com/u/t", "https://stats.example.com/settings")
	for _, want := range []string{"shop.&#8203;example", "15​ Oct 2026", "10,000", "pageviews", `href="https://stats.example.com/shop.example"`, "background:#c6ff3a", "color:#0b0d10", "Stop these alerts", "x-apple-data-detectors"} {
		want = strings.ReplaceAll(want, "&#8203;", "​")
		if !strings.Contains(h, want) {
			t.Errorf("missing %q", want)
		}
	}
	if strings.Contains(h, "shop.example<") || strings.Contains(h, "text-transform:uppercase") {
		t.Error("a bare domain or caps eyebrow is left")
	}
}
