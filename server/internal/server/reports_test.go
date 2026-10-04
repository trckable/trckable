package server

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/config"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func TestMonthlyIsDueOnceAMonthFromTheFirstMorning(t *testing.T) {
	berlin, _ := time.LoadLocation("Europe/Berlin")
	at := func(s string) time.Time { v, _ := time.ParseInLocation("2006-01-02 15:04", s, berlin); return v }
	if _, _, due := monthlyDue(at("2026-10-01 07:59"), berlin, 0); due {
		t.Fatal("due before 08:00 on the 1st")
	}
	from, to, due := monthlyDue(at("2026-10-01 08:00"), berlin, 0)
	if !due || !from.Equal(at("2026-09-01 00:00")) || !to.Equal(at("2026-10-01 00:00")) {
		t.Fatalf("the 1st: %v %v %v", from, to, due)
	}
	if _, _, due := monthlyDue(at("2026-10-15 12:00"), berlin, at("2026-10-01 08:01").Unix()); due {
		t.Fatal("sent twice in one month")
	}
	if from, _, due := monthlyDue(at("2026-10-03 12:00"), berlin, at("2026-09-01 08:01").Unix()); !due || !from.Equal(at("2026-09-01 00:00")) {
		t.Fatalf("a catch-up: %v %v", from, due)
	}
	// January reports December of last year; February's month is shorter and still whole.
	if from, to, _ := monthlyDue(at("2027-01-01 09:00"), berlin, 0); !from.Equal(at("2026-12-01 00:00")) || !to.Equal(at("2027-01-01 00:00")) {
		t.Errorf("new year: %v %v", from, to)
	}
	f, to := lastMonth(at("2026-03-10 10:00"), berlin)
	if !f.Equal(at("2026-02-01 00:00")) || !to.Equal(at("2026-03-01 00:00")) {
		t.Errorf("last month: %v %v", f, to)
	}
	p := periodOf("monthly", f, to)
	if !p.prevFrom.Equal(at("2026-01-01 00:00")) || !p.prevTo.Equal(f) {
		t.Errorf("the month before: %+v", p)
	}
	p = periodOf("weekly", at("2026-09-14 00:00"), at("2026-09-21 00:00"))
	if !p.prevFrom.Equal(at("2026-09-07 00:00")) || !p.prevTo.Equal(at("2026-09-14 00:00")) {
		t.Errorf("the week before: %+v", p)
	}
}

func TestPDFName(t *testing.T) {
	got := pdfName(sqlite.SiteInfo{Domain: "ac me/../x.com"}, period{from: time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC)})
	if got != "ac-me-..-x.com-2026-09-14.pdf" || strings.ContainsAny(got, "/\\ \r\n\"") {
		t.Errorf("name: %q", got)
	}
}

// smtpBox is a mail server that keeps every message it is given.
func smtpBox(t *testing.T) (addr string, got chan string) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	got = make(chan string, 16)
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				defer c.Close()
				r := bufio.NewReader(c)
				fmt.Fprint(c, "220 fake\r\n")
				var data strings.Builder
				in := false
				for {
					line, err := r.ReadString('\n')
					if err != nil {
						return
					}
					if in {
						if line == ".\r\n" {
							in = false
							fmt.Fprint(c, "250 queued\r\n")
							got <- data.String()
							data.Reset()
							continue
						}
						data.WriteString(line)
						continue
					}
					switch cmd := strings.ToUpper(strings.TrimSpace(line)); {
					case strings.HasPrefix(cmd, "DATA"):
						in = true
						fmt.Fprint(c, "354 go\r\n")
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
	return ln.Addr().String(), got
}

// A due schedule goes to each address on its own, with its own stop link and
// the PDF; once sent, it is not sent again that period; without an address to
// build the stop link from, nothing is sent at all.
func TestDueSchedulesAreSentOncePerPeriodToEachAddress(t *testing.T) {
	old, oldClock := alerts.Mail, reportClock
	t.Cleanup(func() { alerts.Mail, reportClock = old, oldClock })
	addr, got := smtpBox(t)
	alerts.Mail, _ = alerts.ParseMailer("smtp://"+addr, "reports@example.com")

	s := newTestServer(t, config.Config{BaseURL: "https://dash.example.com"})
	ctx := context.Background()
	for i := 0; i < 100 && s.api.Query() == nil; i++ {
		time.Sleep(50 * time.Millisecond)
	}
	if s.api.Query() == nil {
		t.Skip("the analytics store did not come up")
	}
	site, err := s.ctl.CreateSite(ctx, sqlite.DefaultAccount, "acme.com", "Acme")
	if err != nil {
		t.Fatal(err)
	}
	s.ctl.SeenSite(ctx, site, time.Now().Unix())
	if err := s.ctl.SetShareLook(ctx, site, "#336699", true, "", false); err != nil {
		t.Fatal(err)
	}
	sc, err := s.ctl.SaveReportSchedule(ctx, sqlite.ReportSchedule{SiteID: site, Name: "Acme GmbH", Cadence: "weekly", Lang: "de", PDF: true, Enabled: true,
		Recipients: []string{"one@example.com", "two@example.com"}})
	if err != nil {
		t.Fatal(err)
	}
	// The next Monday, 09:00 UTC: the site's week (UTC, Monday first) has just ended.
	now := time.Now().UTC()
	monday := time.Date(now.Year(), now.Month(), now.Day()+int((8-int(now.Weekday()))%7)+7, 9, 0, 0, 0, time.UTC)
	reportClock = func() time.Time { return monday }
	reportTriedMu.Lock()
	delete(reportTried, sc.ID)
	reportTriedMu.Unlock()

	s.cfg.BaseURL = ""
	s.checkReports(ctx)
	select {
	case m := <-got:
		t.Fatalf("a report went out without a stop link:\n%.300s", m)
	case <-time.After(300 * time.Millisecond):
	}
	s.cfg.BaseURL = "https://dash.example.com"
	reportTriedMu.Lock()
	delete(reportTried, sc.ID)
	reportTriedMu.Unlock()
	s.checkReports(ctx)

	var msgs []string
	for range 2 {
		select {
		case m := <-got:
			msgs = append(msgs, m)
		case <-time.After(15 * time.Second):
			t.Fatalf("only %d of 2 reports arrived", len(msgs))
		}
	}
	for _, want := range [][]string{{"To: <one@example.com>"}, {"To: <two@example.com>"}} {
		found := false
		for _, m := range msgs {
			found = found || strings.Contains(m, want[0])
		}
		if !found {
			t.Errorf("nobody got %s", want[0])
		}
	}
	m := msgs[0]
	for _, want := range []string{"multipart/mixed", "application/pdf", ".pdf", "List-Unsubscribe: <https://dash.example.com/r/", "Wochenbericht"} {
		if !strings.Contains(m, want) {
			t.Errorf("a report lacks %q:\n%.1500s", want, m)
		}
	}
	if strings.Contains(msgs[0], "/r/") && strings.Contains(msgs[1], "/r/") {
		a := msgs[0][strings.Index(msgs[0], "/r/"):][:60]
		b := msgs[1][strings.Index(msgs[1], "/r/"):][:60]
		if a == b {
			t.Error("two people share one stop link")
		}
	}
	if got, _ := s.ctl.ReportScheduleByID(ctx, sc.ID); got.LastSent != monday.Unix() {
		t.Errorf("not marked as sent: %d", got.LastSent)
	}
	reportTriedMu.Lock()
	delete(reportTried, sc.ID)
	reportTriedMu.Unlock()
	s.checkReports(ctx)
	select {
	case m := <-got:
		t.Fatalf("sent twice in one period:\n%.200s", m)
	case <-time.After(300 * time.Millisecond):
	}
}
