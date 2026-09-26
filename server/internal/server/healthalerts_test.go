package server

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/backup"
	"github.com/trckable/trckable/server/internal/config"
	"github.com/trckable/trckable/server/internal/revenue"
	"github.com/trckable/trckable/server/internal/secrets"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/wal"
)

type sent struct {
	target string
	ev     alerts.Event
}

func alerterFor(t *testing.T, ctl *sqlite.Store, targets []string, out *[]sent, fail *atomic.Bool) *healthAlerter {
	t.Helper()
	return &healthAlerter{
		state:   ctl,
		targets: func(context.Context) ([]string, error) { return targets, nil },
		send: func(_ context.Context, target string, e alerts.Event) error {
			if fail != nil && fail.Load() {
				return errors.New("the webhook answered 500")
			}
			*out = append(*out, sent{target, e})
			return nil
		},
		now: time.Now,
	}
}

func openCtl(t *testing.T, dir string) *sqlite.Store {
	t.Helper()
	ctl, err := sqlite.Open(context.Background(), filepath.Join(dir, "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	return ctl
}

// Each problem is sent once when it starts and once when it clears, however
// many checks see it, and a restart in the middle sends nothing again.
func TestHealthProblemsAlertOnceAndClearOnce(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	for _, p := range problemOrder {
		t.Run(p, func(t *testing.T) {
			ctl := openCtl(t, dir)
			var got []sent
			h := alerterFor(t, ctl, []string{"https://hooks.example.com/a"}, &got, nil)
			on := map[string]string{p: "something broke"}
			for i := 0; i < 10; i++ {
				h.check(ctx, on)
			}
			if len(got) != 1 || got[0].ev.Data["problem"] != p || got[0].ev.Data["state"] != "started" || got[0].ev.Title == "" {
				t.Fatalf("while it lasts: %+v", got)
			}

			// A restart while the problem is still there says nothing new.
			ctl.Close()
			ctl = openCtl(t, dir)
			defer ctl.Close()
			h = alerterFor(t, ctl, []string{"https://hooks.example.com/a"}, &got, nil)
			h.check(ctx, on)
			if len(got) != 1 {
				t.Fatalf("sent again after a restart: %+v", got)
			}

			// One clean look is not a fix (the log retries every 30 s).
			for i := 0; i < healthClearAfter-1; i++ {
				h.check(ctx, nil)
			}
			h.check(ctx, on)
			if len(got) != 1 {
				t.Fatalf("a short gap was sent as cleared: %+v", got)
			}
			for i := 0; i < healthClearAfter+10; i++ {
				h.check(ctx, nil)
			}
			if len(got) != 2 || got[1].ev.Data["state"] != "cleared" || got[1].ev.Data["problem"] != p {
				t.Fatalf("after it cleared: %+v", got)
			}
			// It can start again, and is sent again.
			h.check(ctx, on)
			if len(got) != 3 || got[2].ev.Data["state"] != "started" {
				t.Fatalf("a second time: %+v", got)
			}
			for i := 0; i < healthClearAfter; i++ {
				h.check(ctx, nil)
			}
			if len(got) != 4 {
				t.Fatalf("second clear: %+v", got)
			}
		})
	}
}

// Without a destination nothing is sent. A destination added while a problem
// lasts is told about it once.
func TestHealthProblemsNeedADestination(t *testing.T) {
	ctx := context.Background()
	ctl := openCtl(t, t.TempDir())
	defer ctl.Close()
	var got []sent
	h := alerterFor(t, ctl, nil, &got, nil)
	all := map[string]string{problemBackup: "x", problemOffsite: "x", problemIngest: "x", problemKey: "x"}
	for i := 0; i < 5; i++ {
		h.check(ctx, all)
	}
	for i := 0; i < healthClearAfter+1; i++ {
		h.check(ctx, nil)
	}
	h.check(ctx, all)
	if len(got) != 0 {
		t.Fatalf("sent with no destination: %+v", got)
	}
	h.targets = func(context.Context) ([]string, error) {
		return []string{"https://hooks.example.com/a", "mailto:me@example.com"}, nil
	}
	h.check(ctx, all)
	h.check(ctx, all)
	if len(got) != 8 {
		t.Fatalf("four problems to two destinations: %d sent, want 8", len(got))
	}
}

// A delivery that fails is tried again at the next check, and then only once.
func TestHealthAlertRetriesAFailedDelivery(t *testing.T) {
	ctx := context.Background()
	ctl := openCtl(t, t.TempDir())
	defer ctl.Close()
	var got []sent
	var fail atomic.Bool
	fail.Store(true)
	h := alerterFor(t, ctl, []string{"https://hooks.example.com/a"}, &got, &fail)
	on := map[string]string{problemBackup: "disk full"}
	h.check(ctx, on)
	h.check(ctx, on)
	fail.Store(false)
	h.check(ctx, on)
	h.check(ctx, on)
	if len(got) != 1 {
		t.Fatalf("sent %d times, want 1", len(got))
	}
}

// Only the operator's own destinations hear about the installation.
func TestOperatorTargetsLeaveCustomersOut(t *testing.T) {
	ctx := context.Background()
	ctl := openCtl(t, t.TempDir())
	defer ctl.Close()
	mine, _ := ctl.CreateSite(ctx, sqlite.DefaultAccount, "mine.com", "")
	acct, _, err := ctl.CreateAccountWithOwner(ctx, "customer@example.com")
	if err != nil {
		t.Fatal(err)
	}
	theirs, _ := ctl.CreateSite(ctx, acct.ID, "theirs.com", "")
	for _, a := range []sqlite.Alert{
		{SiteID: mine, Kind: "stopped", Enabled: true, Target: "https://hooks.example.com/mine"},
		{SiteID: mine, Kind: "spike", Enabled: true, Target: "https://hooks.example.com/mine"},
		{SiteID: mine, Kind: "customer", Enabled: false, Target: "https://hooks.example.com/off"},
		{SiteID: theirs, Kind: "stopped", Enabled: true, Target: "https://hooks.example.com/theirs"},
	} {
		if _, err := ctl.SaveAlert(ctx, a); err != nil {
			t.Fatal(err)
		}
	}
	got, err := ctl.OperatorTargets(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0] != "https://hooks.example.com/mine" {
		t.Fatalf("targets: %v", got)
	}
}

// The four problems are read from what the server already holds.
func TestProblemsReadsTheServer(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	ctl := openCtl(t, dir)
	defer ctl.Close()
	lg, err := wal.Open(filepath.Join(dir, "wal"), wal.Options{NoSync: true})
	if err != nil {
		t.Fatal(err)
	}
	defer lg.Close()
	s := &Server{cfg: config.Config{DataDir: dir}, ctl: ctl, log: lg}
	if p := s.problems(); len(p) != 0 {
		t.Fatalf("a healthy server has problems: %v", p)
	}

	// A failed backup, also after a restart (kept on disk until one works).
	os.MkdirAll(s.backupsDir(), 0o700)
	os.WriteFile(filepath.Join(s.backupsDir(), FailedFile), []byte("no space left on device"), 0o600)
	if p := s.problems(); p[problemBackup] != "no space left on device" {
		t.Fatalf("backup: %v", p)
	}

	r, err := backup.ParseRemote("https://key:secret@s3.example.com/bucket")
	if err != nil {
		t.Fatal(err)
	}
	s.remote = r
	s.offsite.Store(&offsiteStatus{at: 1, err: "403 Forbidden"})
	if p := s.problems(); p[problemOffsite] != "403 Forbidden" {
		t.Fatalf("offsite: %v", p)
	}

	box, _ := secrets.New([]byte("the first instance key"))
	if _, err := revenue.New(ctx, ctl.DB, box); err != nil {
		t.Fatal(err)
	}
	other, _ := secrets.New([]byte("a different instance key"))
	s.revenue, err = revenue.New(ctx, ctl.DB, other)
	if err != nil {
		t.Fatal(err)
	}
	if p := s.problems(); p[problemKey] == "" {
		t.Fatalf("key: %v", p)
	}
}
