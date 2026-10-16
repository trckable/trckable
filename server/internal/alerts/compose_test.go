package alerts

import (
	"bytes"
	"github.com/trckable/trckable/server/internal/mailkit"
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
	var walk func(ct, enc string, r io.Reader)
	walk = func(ct, enc string, r io.Reader) {
		typ, params, _ := mime.ParseMediaType(ct)
		if strings.HasPrefix(typ, "multipart/") {
			mr := multipart.NewReader(r, params["boundary"])
			for {
				p, err := mr.NextPart()
				if err != nil {
					return
				}
				walk(p.Header.Get("Content-Type"), p.Header.Get("Content-Transfer-Encoding"), p)
			}
		}
		if enc == "quoted-printable" {
			r = quotedprintable.NewReader(r)
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

// An alert without a designed email of its own is its title and message
// under the site's name, everything escaped, and only safe links drawn.
func TestComposePlainAlertEscapesAndKeepsLinksSafe(t *testing.T) {
	e := Event{Domain: "shop.example", Title: "<b>x</b>", Message: "a<script>\nb", Unsubscribe: "javascript:alert(1)", Settings: "https://stats.example.com/settings?site=s&tab=alerts"}
	r := Compose(e)
	for _, bad := range []string{"<b>x</b>", "<script>", "javascript:"} {
		if strings.Contains(r.HTML, bad) {
			t.Errorf("unescaped %q", bad)
		}
	}
	for _, want := range []string{"&lt;b&gt;x&lt;/b&gt;", "a&lt;script&gt;<br>b", "shop.&#8203;example", "settings?site=s&amp;tab=alerts", "Alert settings", "max-width:600px"} {
		if !strings.Contains(r.HTML, want) {
			t.Errorf("missing %q", want)
		}
	}
	if strings.Contains(r.HTML, "Stop these alerts") {
		t.Error("an unsafe stop link was drawn")
	}
	if r.Subject != "<b>x</b> · shop.example" || len(r.Attachments) != 1 || r.Attachments[0].Inline != mailkit.LogoCID {
		t.Errorf("subject %q attachments %v", r.Subject, r.Attachments)
	}
	if !strings.Contains(r.Text, "a<script>\nb") || !strings.Contains(r.Text, "Alert settings: https://stats.example.com/settings?site=s&tab=alerts") {
		t.Errorf("text:\n%s", r.Text)
	}
}

func TestEmailCarriesTextAndHTML(t *testing.T) {
	addr, got := fakeSMTP(t)
	m, err := ParseMailer("smtp://"+addr, "trckable@example.com")
	if err != nil {
		t.Fatal(err)
	}
	e := Event{Kind: "surge", Domain: "x.com", Title: "Your site is having a moment", Subject: "x.com is having a moment",
		Message: "Right now 27 people are on x.com.", Unsubscribe: "https://stats.example.com/u/a.sig",
		Settings: "https://stats.example.com/settings?site=s&tab=alerts", Ask: "https://stats.example.com/x.com?peek=1&at=2",
		Email: &mailkit.Email{Blocks: []mailkit.Block{mailkit.Hero{Big: "27 people"}, mailkit.Rows{Rows: [][2]string{{"Top page", "/a/<b>"}}}, mailkit.Button{Label: "Open Live →", URL: "https://stats.example.com/x.com"}}}}
	if err := m.send(t.Context(), "me@example.com", e); err != nil {
		t.Fatal(err)
	}
	raw := <-got
	subject, text, page, hdr := parts(t, raw)
	if subject != "x.com is having a moment" || hdr.Get("List-Unsubscribe") != "<https://stats.example.com/u/a.sig>" {
		t.Errorf("subject %q headers %v", subject, hdr)
	}
	for _, want := range []string{"27 people", "Top page: /a/<b>", "Open Live →: https://stats.example.com/x.com", "Stop these alerts: https://stats.example.com/u/a.sig", "Open in dashboard: https://stats.example.com/x.com?peek=1&at=2"} {
		if !strings.Contains(text, want) {
			t.Errorf("text misses %q:\n%s", want, text)
		}
	}
	for _, want := range []string{"27 people", "/a/&lt;b&gt;", "Open Live →", "https://stats.example.com/u/a.sig", "settings?site=s&amp;tab=alerts", "x.com?peek=1&amp;at=2", "cid:" + mailkit.LogoCID} {
		if !strings.Contains(page, want) {
			t.Errorf("html misses %q", want)
		}
	}
	if strings.Index(raw, "text/plain") > strings.Index(raw, "text/html") || !strings.Contains(raw, "Content-ID: <"+mailkit.LogoCID+">") {
		t.Error("the text must come first, and the logo travel inline")
	}
}

func TestComposeUsesTheStopLabelItIsGiven(t *testing.T) {
	r := Compose(Event{Title: "Your week", Unsubscribe: "https://stats.example.com/u/a", Email: &mailkit.Email{Foot: mailkit.Foot{StopLabel: "Stop receiving this report"}}})
	if !strings.Contains(r.HTML, "Stop receiving this report") || strings.Contains(r.HTML, "Stop these alerts") {
		t.Error("the stop label")
	}
}
