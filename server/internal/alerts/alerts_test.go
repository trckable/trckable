package alerts

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// An alert must never become a way to probe the network trckable runs in.
func TestCheckTargetRefusesInternalAddresses(t *testing.T) {
	for _, bad := range []string{
		"http://localhost:8080/hook",
		"http://127.0.0.1/hook",
		"https://trckable.railway.internal/hook",
		"https://printer.local/hook",
		"ftp://example.com/hook",
		"not a url",
		"",
	} {
		if err := CheckTarget(bad); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
}

func TestSendPostsTheEvent(t *testing.T) {
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b := make([]byte, 512)
		n, _ := r.Body.Read(b)
		got = string(b[:n])
		w.WriteHeader(200)
	}))
	defer srv.Close()

	// The test server listens on 127.0.0.1, which CheckTarget refuses on
	// purpose: this proves the guard runs before anything is sent.
	if err := Send(context.Background(), srv.URL, Event{Kind: "spike", Title: "Busy day"}); err == nil {
		t.Fatal("sent to a loopback address")
	}
	if got != "" {
		t.Fatalf("something was delivered anyway: %s", got)
	}
	if !strings.Contains(ErrUnsafeTarget.Error(), "reachable") {
		t.Fatal("the refusal should explain itself")
	}
}

// A mail server just big enough to receive one message.
func fakeSMTP(t *testing.T) (addr string, got chan string) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	got = make(chan string, 1)
	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		defer c.Close()
		r := bufio.NewReader(c)
		fmt.Fprint(c, "220 fake ESMTP\r\n")
		var data strings.Builder
		inData := false
		for {
			line, err := r.ReadString('\n')
			if err != nil {
				return
			}
			if inData {
				if line == ".\r\n" {
					inData = false
					fmt.Fprint(c, "250 queued\r\n")
					got <- data.String()
					continue
				}
				data.WriteString(line)
				continue
			}
			switch cmd := strings.ToUpper(strings.TrimSpace(line)); {
			case strings.HasPrefix(cmd, "EHLO"), strings.HasPrefix(cmd, "HELO"):
				fmt.Fprint(c, "250 fake\r\n")
			case strings.HasPrefix(cmd, "DATA"):
				inData = true
				fmt.Fprint(c, "354 go on\r\n")
			case strings.HasPrefix(cmd, "QUIT"):
				fmt.Fprint(c, "221 bye\r\n")
				return
			default:
				fmt.Fprint(c, "250 ok\r\n")
			}
		}
	}()
	return ln.Addr().String(), got
}

func TestAlertsByEmail(t *testing.T) {
	old := Mail
	t.Cleanup(func() { Mail = old })

	Mail = nil
	if err := CheckTarget("mailto:me@example.com"); err == nil {
		t.Fatal("an email target was accepted with no mail server set up")
	}
	addr, got := fakeSMTP(t)
	m, err := ParseMailer("smtp://"+addr, "trckable@example.com")
	if err != nil {
		t.Fatal(err)
	}
	Mail = m
	if err := CheckTarget("mailto:not an address"); err == nil {
		t.Fatal("a broken address was accepted")
	}
	if err := CheckTarget("mailto:me@example.com"); err != nil {
		t.Fatal(err)
	}
	e := Event{Kind: "weekly", Domain: "demo.trckable.com", Title: "Your week\r\nBcc: victim@example.com", Message: "4,512 visitors\nup 13%", At: time.Date(2026, 9, 21, 8, 0, 0, 0, time.UTC)}
	if err := Send(context.Background(), "mailto:me@example.com", e); err != nil {
		t.Fatal(err)
	}
	msg := <-got
	for _, want := range []string{"To: <me@example.com>", "Subject: Your week  Bcc: victim@example.com · demo.trckable.com", "4,512 visitors\r\nup 13%"} {
		if !strings.Contains(msg, want) {
			t.Errorf("missing %q in:\n%s", want, msg)
		}
	}
	if strings.Contains(msg, "\r\nBcc:") {
		t.Fatal("a title added a header")
	}
	if _, err := ParseMailer("https://mail.example.com", "a@b.c"); err == nil {
		t.Error("a non-SMTP URL was accepted")
	}
}

// Rebinding: a name that looked public when it was checked can resolve to
// this machine when the connection is made. The dialler checks the address
// it actually connects to, so that second answer is refused too.
func TestDialRefusesInternalAddressesAfterLookup(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	if _, err := safeDial(context.Background(), "tcp", ln.Addr().String()); !errors.Is(err, ErrUnsafeTarget) {
		t.Fatalf("dialled loopback: %v", err)
	}
	for ip, unsafe := range map[string]bool{
		"127.0.0.1": true, "::1": true, "10.1.2.3": true, "192.168.0.10": true, "172.16.5.5": true,
		"169.254.169.254": true, "fd00::1": true, "fe80::1": true, "100.64.1.1": true, "0.0.0.0": true,
		"224.0.0.1": true, "8.8.8.8": false, "2606:4700::1111": false, "100.128.0.1": false,
	} {
		if got := unsafeIP(net.ParseIP(ip)); got != unsafe {
			t.Errorf("%s: unsafe=%v, want %v", ip, got, unsafe)
		}
	}
}
