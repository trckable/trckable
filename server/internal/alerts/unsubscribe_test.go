package alerts

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestUnsubscribeTokenNamesOneAlertAndNothingElse(t *testing.T) {
	key := []byte("a key only this server has, 32 b")
	tok := UnsubscribeToken(key, "alert_abc123")
	if id, ok := UnsubscribeAlert(key, tok); !ok || id != "alert_abc123" {
		t.Fatalf("own token: %q %v", id, ok)
	}
	// Another alert's id with this signature, a changed signature, another
	// server's key, and shapes that are no token at all.
	sig := tok[strings.LastIndexByte(tok, '.'):]
	for _, bad := range []string{"alert_other" + sig, tok[:len(tok)-1] + "x", "alert_abc123.", ".sig", "alert_abc123", "", "alert_abc123.alert_abc123"} {
		if id, ok := UnsubscribeAlert(key, bad); ok {
			t.Errorf("accepted %q as %q", bad, id)
		}
	}
	if _, ok := UnsubscribeAlert([]byte("a different key, also 32 bytes!!"), tok); ok {
		t.Error("another server's key accepted the token")
	}
}

func TestEmailCarriesTheStopLink(t *testing.T) {
	old := Mail
	t.Cleanup(func() { Mail = old })
	addr, got := fakeSMTP(t)
	m, err := ParseMailer("smtp://"+addr, "trckable@example.com")
	if err != nil {
		t.Fatal(err)
	}
	Mail = m
	link := "https://stats.example.com/u/alert_1.sig"
	e := Event{Kind: "weekly", Domain: "demo.example.com", Title: "Your week", Message: "4,512 visitors", Unsubscribe: link, At: time.Now()}
	if err := Send(context.Background(), "mailto:me@example.com", e); err != nil {
		t.Fatal(err)
	}
	msg := <-got
	for _, want := range []string{"List-Unsubscribe: <" + link + ">", "List-Unsubscribe-Post: List-Unsubscribe=One-Click", "Stop this email: " + link} {
		if !strings.Contains(msg, want) {
			t.Errorf("missing %q in:\n%s", want, msg)
		}
	}
	// Without a public address there is nothing to link: the old line stays.
	addr2, got2 := fakeSMTP(t)
	if Mail, err = ParseMailer("smtp://"+addr2, "trckable@example.com"); err != nil {
		t.Fatal(err)
	}
	e.Unsubscribe = ""
	if err := Send(context.Background(), "mailto:me@example.com", e); err != nil {
		t.Fatal(err)
	}
	if msg := <-got2; strings.Contains(msg, "List-Unsubscribe") || !strings.Contains(msg, "Settings → Alerts") {
		t.Errorf("no link, no header:\n%s", msg)
	}
}

func TestResendSendsTheSameMessageOverHTTPS(t *testing.T) {
	var body map[string]any
	var auth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth = r.Header.Get("Authorization")
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &body)
		w.WriteHeader(200)
	}))
	defer srv.Close()
	if _, err := ParseResend("not a key", "a@b.co"); err == nil {
		t.Error("a key without re_ was accepted")
	}
	if _, err := ParseResend("re_abc", "nope"); err == nil {
		t.Error("a sender that is no address was accepted")
	}
	// A sender written with a name is the address inside it, as the From line is built from it.
	m, err := ParseResend("re_abc", "trckable <trckable@example.com>")
	if err != nil || m.from != "trckable@example.com" {
		t.Fatalf("%v %v", m, err)
	}
	m.resend.endpoint = srv.URL
	link := "https://stats.example.com/u/alert_1.sig"
	if err := m.send(context.Background(), "me@example.com", Event{Title: "Your week", Domain: "demo.example.com", Message: "4,512 visitors", Unsubscribe: link}); err != nil {
		t.Fatal(err)
	}
	if auth != "Bearer re_abc" || body["subject"] != "Your week · demo.example.com" || !strings.Contains(body["text"].(string), "Stop this email: "+link) {
		t.Fatalf("auth %q body %v", auth, body)
	}
	if h := body["headers"].(map[string]any); h["List-Unsubscribe"] != "<"+link+">" || h["List-Unsubscribe-Post"] != "List-Unsubscribe=One-Click" {
		t.Errorf("headers %v", h)
	}
	if to := body["to"].([]any); len(to) != 1 || to[0] != "me@example.com" {
		t.Errorf("to %v", to)
	}
	// A refusal says why, and never the key.
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(403)
		_, _ = io.WriteString(w, `{"message":"The sender domain is not verified"}`)
	}))
	defer bad.Close()
	m.resend.endpoint = bad.URL
	err = m.send(context.Background(), "me@example.com", Event{Title: "x"})
	if err == nil || !strings.Contains(err.Error(), "403") || !strings.Contains(err.Error(), "not verified") || strings.Contains(err.Error(), "re_abc") {
		t.Errorf("refusal: %v", err)
	}
}
