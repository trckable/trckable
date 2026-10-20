package server

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/config"
	"github.com/trckable/trckable/server/internal/ingest"
	"github.com/trckable/trckable/server/internal/notice"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/wal"
)

// hooks stands in for the webhook: it records what arrives, and fails while told to.
type hooks struct {
	mu   sync.Mutex
	fail bool
	got  []alerts.Event
	to   []string
}

func (h *hooks) post(_ context.Context, target string, e alerts.Event) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.fail {
		return errors.New("the webhook answered 500")
	}
	h.got, h.to = append(h.got, e), append(h.to, target)
	return nil
}

func (h *hooks) failing(on bool) {
	h.mu.Lock()
	h.fail = on
	h.mu.Unlock()
}

func (h *hooks) kinds() []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	var out []string
	for _, e := range h.got {
		out = append(out, e.Kind)
	}
	return out
}

type probeRig struct {
	s     *Server
	ctl   *sqlite.Store
	hooks *hooks
	clock time.Time
	site  sqlite.SiteRow
}

func newProbeRig(t *testing.T) *probeRig {
	t.Helper()
	ctx := context.Background()
	dir := t.TempDir()
	ctl, err := sqlite.Open(ctx, filepath.Join(dir, "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ctl.Close() })
	lg, err := wal.Open(filepath.Join(dir, "wal"), wal.Options{NoSync: true})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { lg.Close() })
	r := &probeRig{ctl: ctl, hooks: &hooks{}, clock: time.Now()}
	hub := &notice.Hub{Store: ctl, Now: func() time.Time { return r.clock }, Post: r.hooks.post}
	r.s = &Server{cfg: config.Config{DataDir: dir}, ctl: ctl, log: lg, ingest: &ingest.Handler{}, started: time.Now(), notices: hub}
	hub.Register(probeForm, r.s.deliverProbe)
	id, err := ctl.CreateSite(ctx, sqlite.DefaultAccount, "shop.example", "")
	if err != nil {
		t.Fatal(err)
	}
	r.site = sqlite.SiteRow{ID: id, Domain: "shop.example", Timezone: "UTC"}
	for _, target := range []string{"https://hooks.example.com/one", "https://hooks.example.com/two"} {
		if _, err := ctl.SaveAlert(ctx, sqlite.Alert{SiteID: id, Kind: "stopped", Enabled: true, Target: target, Threshold: 6}); err != nil {
			t.Fatal(err)
		}
	}
	return r
}

func (r *probeRig) goesDown() {
	now := r.clock.Unix()
	before := sqlite.SiteProbe{At: now - 300}
	after := sqlite.SiteProbe{At: now, Error: "No answer within 10 seconds", Failures: sqlite.DownAfter, DownSince: now - 300}
	r.s.probed(context.Background(), r.site, before, after)
	r.s.notices.Wait()
}

func (r *probeRig) comesBack() {
	now := r.clock.Unix()
	before := sqlite.SiteProbe{At: now - 300, Error: "x", Failures: sqlite.DownAfter, DownSince: now - 900}
	r.s.probed(context.Background(), r.site, before, sqlite.SiteProbe{At: now})
	r.s.notices.Wait()
}

func (r *probeRig) later(d time.Duration) {
	r.clock = r.clock.Add(d)
	r.s.notices.Drain(context.Background())
	r.s.notices.Wait()
}

// A site going down is told once, to each of its alerts, and a failing
// destination does not make the news get lost: it is tried again until it goes
// through, and then not again.
func TestADownNoticeSurvivesAFailingDestination(t *testing.T) {
	r := newProbeRig(t)
	r.hooks.failing(true)
	r.goesDown()
	if got := r.hooks.kinds(); len(got) != 0 {
		t.Fatalf("delivered while failing: %v", got)
	}
	r.hooks.failing(false)
	r.later(3 * time.Minute)
	if got := r.hooks.kinds(); len(got) != 2 || got[0] != "down" || got[1] != "down" {
		t.Fatalf("after the destination came back: %v", got)
	}
	r.later(2 * time.Hour)
	if got := r.hooks.kinds(); len(got) != 2 {
		t.Fatalf("told again: %v", got)
	}
}

// The notice that the site is back is the one that must not be lost: the
// site will not come back twice.
func TestABackUpNoticeSurvivesAFailingDestination(t *testing.T) {
	r := newProbeRig(t)
	r.goesDown()
	r.hooks.failing(true)
	r.clock = r.clock.Add(15 * time.Minute)
	r.comesBack()
	r.later(10 * time.Minute)
	if got := r.hooks.kinds(); len(got) != 2 {
		t.Fatalf("delivered while failing: %v", got)
	}
	r.hooks.failing(false)
	r.later(10 * time.Minute)
	if got := strings.Join(r.hooks.kinds(), " "); got != "down down up up" {
		t.Fatalf("the notices: %q", got)
	}
	for _, e := range r.hooks.got[2:] {
		if !strings.Contains(e.Message, "again after") {
			t.Fatalf("the back-up message: %q", e.Message)
		}
	}
}

// If the list of alerts cannot be read when the site goes down, the news waits
// for the next try instead of being dropped.
func TestADownNoticeWaitsForADatabaseThatIsBusy(t *testing.T) {
	r := newProbeRig(t)
	ctx := context.Background()
	if _, err := r.ctl.DB.ExecContext(ctx, `ALTER TABLE alerts RENAME TO alerts_away`); err != nil {
		t.Fatal(err)
	}
	r.goesDown()
	if len(r.hooks.kinds()) != 0 {
		t.Fatal("told without knowing whom")
	}
	if _, err := r.ctl.DB.ExecContext(ctx, `ALTER TABLE alerts_away RENAME TO alerts`); err != nil {
		t.Fatal(err)
	}
	r.later(3 * time.Minute)
	if got := r.hooks.kinds(); len(got) != 2 {
		t.Fatalf("after the database came back: %v", got)
	}
}

// One alert that cannot be delivered does not stop the ones after it, and the
// loop does not end at the first alert it sends: every alert that is due fires.
func TestEveryDueAlertFiresEvenWhenAnEarlierOneFails(t *testing.T) {
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
	s := &Server{cfg: config.Config{DataDir: dir}, ctl: ctl, log: lg, ingest: &ingest.Handler{}, started: time.Now(), notices: &notice.Hub{Store: ctl}}
	box := fakeMailServer(t)

	var wantSubjects []string
	for i, target := range []string{"https://localhost/never", "mailto:a@example.com", "mailto:b@example.com", "mailto:c@example.com"} {
		domain := string(rune('a'+i)) + ".example"
		id, err := ctl.CreateSite(ctx, sqlite.DefaultAccount, domain, "")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := ctl.DB.ExecContext(ctx, `UPDATE sites SET last_event_at = ? WHERE id = ?`, time.Now().Add(-9*time.Hour).Unix(), id); err != nil {
			t.Fatal(err)
		}
		if _, err := ctl.SaveAlert(ctx, sqlite.Alert{SiteID: id, Kind: "stopped", Enabled: true, Target: target, Threshold: 6}); err != nil {
			t.Fatal(err)
		}
		if i > 0 {
			wantSubjects = append(wantSubjects, domain+": no visits for ")
		}
	}
	if err := s.checkAlerts(ctx); err != nil {
		t.Fatal(err)
	}
	s.notices.Wait()
	got := box.all()
	if len(got) != 3 {
		t.Fatalf("%d messages, want the 3 alerts after the failing one", len(got))
	}
	// The failing one is the outbox's now: marked as told, and kept to be tried again.
	list, err := ctl.LiveAlerts(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, a := range list {
		if a.LastFired == 0 {
			t.Fatalf("%s: not marked after it was kept", a.Target)
		}
	}
	due, err := ctl.DueNotices(ctx, time.Now().Add(time.Hour), 10)
	if err != nil || len(due) != 1 || due[0].Target != "https://localhost/never" || due[0].Account != sqlite.DefaultAccount || strings.Contains(due[0].LastError, "localhost") {
		t.Fatalf("kept for another try: %+v %v", due, err)
	}
	// A mark that did not stick makes the next check find the alert due again; it is not sent twice.
	if _, err := ctl.DB.ExecContext(ctx, `UPDATE alerts SET last_fired = 0`); err != nil {
		t.Fatal(err)
	}
	if err := s.checkAlerts(ctx); err != nil {
		t.Fatal(err)
	}
	s.notices.Wait()
	if n := len(box.all()); n != 3 {
		t.Fatalf("sent again after an unsaved mark: %d messages", n)
	}
	for i, raw := range got {
		if _, subject := subjectOf(t, raw); !strings.HasPrefix(subject, strings.TrimSuffix(wantSubjects[i], " ")) {
			t.Errorf("message %d: %q", i, subject)
		}
	}
}
