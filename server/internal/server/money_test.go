package server

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/config"
	"github.com/trckable/trckable/server/internal/realtime"
	"github.com/trckable/trckable/server/internal/revenue"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func moneyServer(t *testing.T) (*Server, *sqlite.Store) {
	t.Helper()
	ctl, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ctl.Close() })
	return &Server{cfg: config.Config{BaseURL: "https://stats.example.com"}, ctl: ctl, hub: realtime.New()}, ctl
}

// The money alert is the switch: a new customer, an upgrade and a refund each
// send one message to the site's destination; a renewal or a one-time sale
// sends none; with the alert off, nothing leaves.
func TestMoneyMessagesFollowTheAlert(t *testing.T) {
	ctx := context.Background()
	s, ctl := moneyServer(t)
	box := fakeMailServer(t)
	on, err := ctl.CreateSite(ctx, sqlite.DefaultAccount, "on.example", "")
	if err != nil {
		t.Fatal(err)
	}
	off, err := ctl.CreateSite(ctx, sqlite.DefaultAccount, "off.example", "")
	if err != nil {
		t.Fatal(err)
	}
	for site, enabled := range map[string]bool{on: true, off: false} {
		if _, err := ctl.SaveAlert(ctx, sqlite.Alert{SiteID: site, Kind: "customer", Enabled: enabled, Target: "mailto:owner@example.com"}); err != nil {
			t.Fatal(err)
		}
	}
	now := time.Now().UnixMilli()
	usd := func(kind string, amount int64) revenue.Notice {
		return revenue.Notice{At: now, Kind: kind, Amount: amount, Currency: "USD", Exponent: 2}
	}
	for _, n := range []revenue.Notice{usd(revenue.NoticeNew, 4200), usd(revenue.NoticeRenewal, 34800), usd(revenue.NoticeSale, 1200),
		{At: now, Kind: revenue.NoticeUpgrade, Amount: 21800, Currency: "USD", Exponent: 2, From: "Pro", To: "Business"}, usd(revenue.NoticeRefund, 1200)} {
		s.mailMoney(ctx, on, n, "Google")
		s.mailMoney(ctx, off, n, "Google")
	}
	got := box.all()
	if len(got) != 3 {
		t.Fatalf("messages: %d, want 3 (new customer, upgrade, refund) for the site with the alert on", len(got))
	}
	for i, want := range []string{"New customer · $42 · via Google · on.example", "Upgrade · Pro → Business · +$218 · on.example", "Refund · −$12 · on.example"} {
		to, subject := subjectOf(t, got[i])
		if to != "<owner@example.com>" || subject != want {
			t.Errorf("message %d: to %q subject %q, want %q", i, to, subject, want)
		}
	}
	// The email says the same in its text part, and a late one says when.
	late := moneyEvent(revenue.Notice{At: time.Date(2026, 10, 16, 14, 5, 0, 0, time.UTC).UnixMilli(), Kind: revenue.NoticeNew, Amount: 4200, Currency: "USD", Exponent: 2, Late: true},
		"shop.example", "Google", "https://stats.example.com/shop.example", time.UTC)
	text := late.Email.Text()
	for _, want := range []string{"New customer", "$42", "Came from: Google", "Paid: 14:05", "Open shop.example"} {
		if !strings.Contains(text, want) {
			t.Errorf("the plain text lacks %q:\n%s", want, text)
		}
	}
	if !strings.Contains(late.Email.HTML(), "$42") {
		t.Error("the HTML lacks the amount")
	}
}

// What a dashboard that is open hears: the line, the kind, and whether it was
// found late.
func TestMoneyIsPublishedToTheStream(t *testing.T) {
	s, _ := moneyServer(t)
	ch, cancel := s.hub.Subscribe("site1")
	defer cancel()
	s.tellMoney("site1", revenue.Notice{At: 5, Kind: revenue.NoticeUpgrade, Amount: 21800, Currency: "USD", Exponent: 2, From: "Pro", To: "Business", Late: true})
	select {
	case l := <-ch:
		if l.Kind != "sale" || l.Change != "upgrade" || l.Text != "Upgrade · Pro → Business · +$218" || !l.Late || l.Amount != 21800 || l.TS != 5 {
			t.Fatalf("stream line: %+v", l)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("nothing reached the stream")
	}
}

// A reconciliation that finds a burst of late payments sends a few messages,
// not one for each.
func TestMoneyMessagesAreCappedPerHour(t *testing.T) {
	var m mailed
	now := time.Now()
	sent := 0
	for range 30 {
		if m.allow("s", now) {
			sent++
		}
	}
	if sent != moneyMailPerHour || !m.allow("other", now) || !m.allow("s", now.Add(time.Hour+time.Second)) {
		t.Fatalf("sent %d of 30; want %d, other sites unaffected, and an hour later open again", sent, moneyMailPerHour)
	}
}
