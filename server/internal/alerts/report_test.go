package alerts

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/http"
	"net/http/httptest"
	"net/mail"
	"strings"
	"testing"
	"time"
)

func sampleReport() Report {
	return Report{
		FromName: "Acme Reports\r\nBcc: x@y.z", Subject: "Wochenbericht · acme.com · 21. Sep – 27. Sep\nBcc: x@y.z", Unsubscribe: "https://dash.example.com/r/tok",
		Text: "Besucher: 1.284\n.dot line\nfür", HTML: "<p>Besucher für <b>Sie</b></p>" + strings.Repeat(" long", 40),
		Attachments: []Attachment{
			{Name: "logo.png", Type: "image/png", Data: []byte("PNGDATA"), Inline: "logo@report"},
			{Name: "report.pdf", Type: "application/pdf", Data: bytes.Repeat([]byte("%PDF"), 100)},
		},
		At: time.Date(2026, 9, 28, 8, 0, 0, 0, time.UTC),
	}
}

func body(t *testing.T, enc string, r io.Reader) []byte {
	t.Helper()
	switch enc {
	case "quoted-printable":
		b, _ := io.ReadAll(quotedprintable.NewReader(r))
		return b
	case "base64":
		raw, _ := io.ReadAll(r)
		b, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(string(raw), "\r\n", ""))
		if err != nil {
			t.Fatal(err)
		}
		return b
	}
	b, _ := io.ReadAll(r)
	return b
}

// The message is mixed (the PDF) around alternative (text, then HTML with its
// inline logo), and a name or subject cannot add a header.
func TestReportMessageStructure(t *testing.T) {
	raw, err := buildReport("trckable@example.com", "client@example.com", sampleReport())
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(bytes.ReplaceAll(raw, []byte("\r\n"), nil), []byte("\n")) {
		t.Error("a bare line feed in the message")
	}
	msg, err := mail.ReadMessage(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	if len(msg.Header["Bcc"]) != 0 {
		t.Fatal("a name or subject added a header")
	}
	dec := new(mime.WordDecoder)
	if s, _ := dec.DecodeHeader(msg.Header.Get("Subject")); !strings.HasPrefix(s, "Wochenbericht · acme.com · 21. Sep – 27. Sep") {
		t.Errorf("subject: %q", s)
	}
	if from, _ := dec.DecodeHeader(msg.Header.Get("From")); !strings.HasPrefix(from, "Acme Reports") || !strings.HasSuffix(from, "<trckable@example.com>") {
		t.Errorf("from: %q", from)
	}
	if msg.Header.Get("List-Unsubscribe") != "<https://dash.example.com/r/tok>" || msg.Header.Get("List-Unsubscribe-Post") != "List-Unsubscribe=One-Click" {
		t.Errorf("unsubscribe headers: %v", msg.Header)
	}
	typ, params, _ := mime.ParseMediaType(msg.Header.Get("Content-Type"))
	if typ != "multipart/mixed" {
		t.Fatalf("top: %s", typ)
	}
	top := multipart.NewReader(msg.Body, params["boundary"])
	alt, _ := top.NextPart()
	atyp, ap, _ := mime.ParseMediaType(alt.Header.Get("Content-Type"))
	if atyp != "multipart/alternative" {
		t.Fatalf("first part: %s", atyp)
	}
	inner := multipart.NewReader(alt, ap["boundary"])
	text, _ := inner.NextPart()
	if got := string(body(t, text.Header.Get("Content-Transfer-Encoding"), text)); !strings.Contains(got, "Besucher: 1.284") || !strings.Contains(got, "\n.dot line") || !strings.Contains(got, "für") {
		t.Errorf("text part: %q", got)
	}
	rel, _ := inner.NextPart()
	rtyp, rp, _ := mime.ParseMediaType(rel.Header.Get("Content-Type"))
	if rtyp != "multipart/related" {
		t.Fatalf("last alternative: %s", rtyp)
	}
	rr := multipart.NewReader(rel, rp["boundary"])
	html, _ := rr.NextPart()
	if got := string(body(t, html.Header.Get("Content-Transfer-Encoding"), html)); !strings.Contains(got, "Besucher für <b>Sie</b>") || strings.Contains(got, "=\r\n") {
		t.Errorf("html part: %.80q", got)
	}
	logo, _ := rr.NextPart()
	if logo.Header.Get("Content-ID") != "<logo@report>" || string(body(t, "base64", logo)) != "PNGDATA" {
		t.Errorf("logo part: %v", logo.Header)
	}
	pdf, _ := top.NextPart()
	if _, pp, _ := mime.ParseMediaType(pdf.Header.Get("Content-Disposition")); pp["filename"] != "report.pdf" || len(body(t, "base64", pdf)) != 400 {
		t.Errorf("pdf part: %v", pdf.Header)
	}
	if more, err := top.NextPart(); err == nil {
		t.Errorf("another part: %v", more.Header)
	}

	// Without an inline file the HTML sits straight in the alternative.
	r := sampleReport()
	r.Attachments = r.Attachments[1:]
	raw, _ = buildReport("a@b.c", "c@d.e", r)
	if bytes.Contains(raw, []byte("multipart/related")) {
		t.Error("related without an inline file")
	}
}

func TestSendReportBySMTP(t *testing.T) {
	old := Mail
	t.Cleanup(func() { Mail = old })
	addr, got := fakeSMTP(t)
	m, err := ParseMailer("smtp://"+addr, "trckable@example.com")
	if err != nil {
		t.Fatal(err)
	}
	Mail = nil
	if err := SendReport(context.Background(), "client@example.com", sampleReport()); err == nil {
		t.Error("sent with no mail server")
	}
	Mail = m
	if err := SendReport(context.Background(), "not an address", sampleReport()); err == nil {
		t.Error("sent to a broken address")
	}
	if err := SendReport(context.Background(), "client@example.com", sampleReport()); err != nil {
		t.Fatal(err)
	}
	msg := <-got
	if !strings.Contains(msg, "To: <client@example.com>") || !strings.Contains(msg, "multipart/mixed") || !strings.Contains(msg, "report.pdf") {
		t.Errorf("what the server got:\n%.600s", msg)
	}
}

func TestSendReportByResend(t *testing.T) {
	var in map[string]any
	var auth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth = r.Header.Get("Authorization")
		_ = json.NewDecoder(r.Body).Decode(&in)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	m := &Mailer{from: "trckable@example.com", resend: &resendAPI{key: "re_test", endpoint: srv.URL}}
	if err := m.sendReport(context.Background(), "client@example.com", sampleReport()); err != nil {
		t.Fatal(err)
	}
	if auth != "Bearer re_test" || in["to"].([]any)[0] != "client@example.com" || !strings.HasPrefix(in["from"].(string), "Acme Reports") || strings.ContainsAny(in["from"].(string), "\r\n") {
		t.Errorf("payload: %v", in)
	}
	atts := in["attachments"].([]any)
	if len(atts) != 2 || atts[0].(map[string]any)["content_id"] != "logo@report" || atts[1].(map[string]any)["filename"] != "report.pdf" {
		t.Errorf("attachments: %v", atts)
	}
	if in["html"] == "" || in["text"] == "" || in["headers"].(map[string]any)["List-Unsubscribe"] == "" {
		t.Errorf("parts: %v", in)
	}
}

func TestReportUnsubscribeTokens(t *testing.T) {
	key, other := []byte("key one"), []byte("key two")
	tok := ReportToken(key, "rep_abc", "Client@Example.com")
	if id, email, ok := ReportUnsubscribe(key, tok); !ok || id != "rep_abc" || email != "client@example.com" {
		t.Errorf("round trip: %q %q %v", id, email, ok)
	}
	if _, _, ok := ReportUnsubscribe(other, tok); ok {
		t.Error("another server's key opened it")
	}
	// An alert's token (same signing, other meaning) is not a report's.
	if _, _, ok := ReportUnsubscribe(key, UnsubscribeToken(key, "alert_x")); ok {
		t.Error("an alert's link opened a report's")
	}
	for _, bad := range []string{"", ".", "abc", tok + "x", "!!." + tok[strings.LastIndexByte(tok, '.')+1:]} {
		if _, _, ok := ReportUnsubscribe(key, bad); ok {
			t.Errorf("%q was accepted", bad)
		}
	}
	// Changing the address in the token breaks its signature.
	forged := base64.RawURLEncoding.EncodeToString([]byte("rep_abc|victim@example.com")) + tok[strings.LastIndexByte(tok, '.'):]
	if _, _, ok := ReportUnsubscribe(key, forged); ok {
		t.Error("a forged address was accepted")
	}
}
