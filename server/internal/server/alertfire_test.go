package server

import (
	"bufio"
	"context"
	"fmt"
	"mime"
	"net"
	"net/mail"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/config"
	"github.com/trckable/trckable/server/internal/ingest"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/wal"
)

// A mail server that keeps every message it is given.
type mailbox struct {
	mu   sync.Mutex
	mail []string
}

func (b *mailbox) all() []string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return append([]string(nil), b.mail...)
}

// subjectOf reads a delivered message the way a mail client does.
func subjectOf(t *testing.T, raw string) (to, subject string) {
	t.Helper()
	m, err := mail.ReadMessage(strings.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	subject, err = new(mime.WordDecoder).DecodeHeader(m.Header.Get("Subject"))
	if err != nil {
		t.Fatal(err)
	}
	return m.Header.Get("To"), subject
}

func fakeMailServer(t *testing.T) *mailbox {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	box := &mailbox{}
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
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
							box.mu.Lock()
							box.mail = append(box.mail, data.String())
							box.mu.Unlock()
							data.Reset()
							fmt.Fprint(c, "250 queued\r\n")
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
		}
	}()
	m, err := alerts.ParseMailer("smtp://"+ln.Addr().String(), "trckable@example.com")
	if err != nil {
		t.Fatal(err)
	}
	old := alerts.Mail
	alerts.Mail = m
	t.Cleanup(func() { alerts.Mail = old })
	return box
}

// "Tracking stopped" is a promise: when a site that was speaking has sent
// nothing for the hours the owner chose, a message reaches the destination;
// not before, not for an alert that is off, not for a site that never spoke,
// and not twice inside the quiet period.
func TestStoppedAlertReachesTheMailbox(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	ctl, err := sqlite.Open(ctx, filepath.Join(dir, "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer ctl.Close()
	lg, err := wal.Open(filepath.Join(dir, "wal"), wal.Options{NoSync: true})
	if err != nil {
		t.Fatal(err)
	}
	defer lg.Close()
	s := &Server{cfg: config.Config{DataDir: dir}, ctl: ctl, log: lg, ingest: &ingest.Handler{}, started: time.Now()}
	box := fakeMailServer(t)

	quiet := func(domain string, silentFor time.Duration) string {
		id, err := ctl.CreateSite(ctx, sqlite.DefaultAccount, domain, "")
		if err != nil {
			t.Fatal(err)
		}
		last := int64(0)
		if silentFor > 0 {
			last = time.Now().Add(-silentFor).Unix()
		}
		if _, err := ctl.DB.ExecContext(ctx, `UPDATE sites SET last_event_at = ? WHERE id = ?`, last, id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	alert := func(site, id string, hours float64, on bool) sqlite.Alert {
		a, err := ctl.SaveAlert(ctx, sqlite.Alert{ID: id, SiteID: site, Kind: "stopped", Enabled: on, Target: "mailto:owner@example.com", Threshold: hours})
		if err != nil {
			t.Fatal(err)
		}
		return a
	}

	early := quiet("early.example", 3*time.Hour) // silent 3 h, asked to hear after 6
	off := quiet("off.example", 30*time.Hour)    // silent long, alert switched off
	never := quiet("never.example", 0)           // never sent anything: nothing to stop
	late := quiet("late.example", 8*time.Hour)   // silent 8 h, asked to hear after 6
	earlyAlert := alert(early, "", 6, true)
	alert(off, "", 6, false)
	alert(never, "", 6, true)
	alert(late, "", 6, true)

	if err := s.checkAlerts(ctx); err != nil {
		t.Fatal(err)
	}
	got := box.all()
	if len(got) != 1 {
		t.Fatalf("want one message, for late.example only; got %d", len(got))
	}
	to, subject := subjectOf(t, got[0])
	if to != "<owner@example.com>" || subject != "Tracking stopped · late.example" {
		t.Fatalf("the message: to %q, subject %q", to, subject)
	}

	// The same condition a minute later says nothing more.
	if err := s.checkAlerts(ctx); err != nil {
		t.Fatal(err)
	}
	if n := len(box.all()); n != 1 {
		t.Fatalf("told again inside the quiet period: %d messages", n)
	}

	// Changing the hours to fewer than the silence so far makes the early site speak.
	alert(early, earlyAlert.ID, 2, true)
	if err := s.checkAlerts(ctx); err != nil {
		t.Fatal(err)
	}
	got = box.all()
	if len(got) != 2 {
		t.Fatalf("after lowering the hours: %d messages, want 2", len(got))
	}
	if _, subject := subjectOf(t, got[1]); subject != "Tracking stopped · early.example" {
		t.Fatalf("the second message: %q", subject)
	}
}
