package server

import (
	"context"
	"errors"
	"net"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// fakeProber answers from a table, on a clock the test moves.
func fakeProber(st *sqlite.Store, answer func(url string) (int, error)) (*prober, *int64) {
	clock := new(int64)
	*clock = 1_800_000_000
	p := &prober{
		st: st, every: 5 * time.Minute, workers: 3,
		now:   func() time.Time { return time.Unix(atomic.LoadInt64(clock), 0) },
		sleep: func(context.Context, time.Duration) {},
		get: func(_ context.Context, u string) (look, error) {
			status, err := answer(u)
			return look{Status: status}, err
		},
		refused: func(context.Context, string) bool { return false },
		changed: func(context.Context, sqlite.SiteRow, sqlite.SiteProbe, sqlite.SiteProbe) {},
	}
	return p, clock
}

func TestDownAlertUsesTheBarsWords(t *testing.T) {
	got := downMessage("Europe/Berlin", sqlite.SiteProbe{DownSince: 1_800_000_000, Error: "No answer within 10 seconds"})
	want := "Your site isn't answering our checks since 09:00 (No answer within 10 seconds). Some visitors still get through, which is why you may still see people online."
	if got != want {
		t.Fatalf("got %q", got)
	}
}

func TestDownNeedsTwoFailuresAndRecoveryOne(t *testing.T) {
	ctx := context.Background()
	st, site := openForIncidents(t)
	status := 503
	p, clock := fakeProber(st, func(string) (int, error) { return status, nil })
	row := sqlite.SiteRow{ID: site, Domain: "a.com"}
	var told []string
	p.changed = func(ctx context.Context, r sqlite.SiteRow, before, after sqlite.SiteProbe) {
		if err := stepIncident(ctx, st, nil, r.ID, 0, sqlite.SiteCheck{}, after, after.At); err != nil {
			t.Fatal(err)
		}
		switch {
		case !before.Down() && after.Down():
			told = append(told, "down")
		case before.Down() && after.Failures == 0:
			told = append(told, "up")
		}
	}
	open := func() *sqlite.Incident { o, _ := st.OpenIncident(ctx, site); return o }

	p.probe(ctx, row)
	if open() != nil {
		t.Fatal("one failure opened an incident")
	}
	*clock += 300
	p.probe(ctx, row)
	in := open()
	if in == nil || in.Kind != "down" || in.Cause != "Your homepage answered 503" || in.StartedAt != 1_800_000_000 {
		t.Fatalf("after two failures: %+v", in)
	}
	*clock += 300
	p.probe(ctx, row) // a third failure changes nothing and tells nobody again
	status = 200
	*clock += 300
	p.probe(ctx, row)
	if open() != nil {
		t.Fatal("one good look did not close it")
	}
	list, _ := st.Incidents(ctx, site, 5, 0, 0, 0)
	if len(list) != 1 || *list[0].EndedAt != 1_800_000_900 {
		t.Fatalf("closed: %+v", list)
	}
	if len(told) != 2 || told[0] != "down" || told[1] != "up" {
		t.Fatalf("told %v", told)
	}
	// A blip: one failure, then fine, is nothing.
	status = 500
	*clock += 300
	p.probe(ctx, row)
	status = 200
	*clock += 300
	p.probe(ctx, row)
	if list, _ = st.Incidents(ctx, site, 5, 0, 0, 0); len(list) != 1 {
		t.Fatalf("a blip made an incident: %+v", list)
	}
}

func TestProbeCauses(t *testing.T) {
	cases := []struct {
		status int
		err    error
		want   string
	}{
		{200, nil, ""},
		{301, nil, ""},
		{404, nil, ""},
		{500, nil, "Your homepage answered 500"},
		{521, nil, "Your homepage answered 521"},
		{0, &net.DNSError{IsNotFound: true}, "DNS name not found"},
		{0, context.DeadlineExceeded, "No answer within 10 seconds"},
		{0, errors.New("connection refused"), "The server could not be reached"},
	}
	for _, c := range cases {
		if got := probeCause(c.status, c.err); got != c.want {
			t.Errorf("%d %v: %q, want %q", c.status, c.err, got, c.want)
		}
	}
}

func TestPrivateAddressesAreNotProbed(t *testing.T) {
	ctx := context.Background()
	st, site := openForIncidents(t)
	p, _ := fakeProber(st, func(string) (int, error) { t.Fatal("a private address was fetched"); return 0, nil })
	p.refused = refusedAddress
	for _, d := range []string{"127.0.0.1", "10.0.0.5", "localhost"} {
		p.probe(ctx, sqlite.SiteRow{ID: site, Domain: d})
	}
	if got, _ := st.ProbeOf(ctx, site); got.At != 0 {
		t.Fatalf("recorded %+v", got)
	}
}

func TestRoundSpreadsAndBoundsTheLooks(t *testing.T) {
	ctx := context.Background()
	st, _ := openForIncidents(t)
	for _, d := range []string{"b.com", "c.com", "d.com", "e.com", "f.com", "g.com", "h.com"} {
		if _, err := st.CreateSite(ctx, sqlite.DefaultAccount, d, ""); err != nil {
			t.Fatal(err)
		}
	}
	var running, peak, total int32
	release := make(chan struct{})
	p, _ := fakeProber(st, func(string) (int, error) {
		n := atomic.AddInt32(&running, 1)
		for {
			m := atomic.LoadInt32(&peak)
			if n <= m || atomic.CompareAndSwapInt32(&peak, m, n) {
				break
			}
		}
		atomic.AddInt32(&total, 1)
		<-release
		atomic.AddInt32(&running, -1)
		return 200, nil
	})
	var mu sync.Mutex
	var waits []time.Duration
	p.sleep = func(_ context.Context, d time.Duration) { mu.Lock(); waits = append(waits, d); mu.Unlock() }
	done := make(chan struct{})
	go func() { p.round(ctx); close(done) }()
	for atomic.LoadInt32(&total) < int32(p.workers) { //nolint:gosec // a handful of workers
		time.Sleep(time.Millisecond)
	}
	time.Sleep(20 * time.Millisecond)
	if got := atomic.LoadInt32(&peak); got != int32(p.workers) { //nolint:gosec // a handful of workers
		t.Fatalf("%d looks at once, want %d", got, p.workers)
	}
	close(release)
	<-done
	if total != 8 { // the seven and a.com
		t.Fatalf("%d looks", total)
	}
	for _, d := range waits {
		if d <= 0 || d >= p.every {
			t.Fatalf("a wait of %s is outside the period", d)
		}
	}
	if len(waits) < 2 || offset("tkb_a", p.every) == offset("tkb_b", p.every) {
		t.Fatalf("not spread: %v", waits)
	}
}

func TestRoundLooksInTheOrderOfTheMoments(t *testing.T) {
	ctx := context.Background()
	st, _ := openForIncidents(t)
	for _, d := range []string{"b.com", "c.com", "d.com", "e.com", "f.com", "g.com", "h.com", "i.com", "j.com"} {
		if _, err := st.CreateSite(ctx, sqlite.DefaultAccount, d, ""); err != nil {
			t.Fatal(err)
		}
	}
	sites, _ := st.AllSites(ctx)
	p, _ := fakeProber(st, func(string) (int, error) { return 200, nil })
	byAge := true // are the sites, in the order they were made, already in the order of their moments?
	for i := 1; i < len(sites); i++ {
		if offset(sites[i].ID, p.every) < offset(sites[i-1].ID, p.every) {
			byAge = false
		}
	}
	if byAge {
		t.Skip("random ids happened to match the creation order")
	}
	var waits []time.Duration
	p.sleep = func(_ context.Context, d time.Duration) { waits = append(waits, d) }
	p.round(ctx)
	if len(waits) < 2 {
		t.Fatalf("waits %v", waits)
	}
	for i := 1; i < len(waits); i++ {
		if waits[i] < waits[i-1] {
			t.Fatalf("looks start out of order: %v", waits)
		}
	}
}

func TestOnlyBareHostnamesAreProbed(t *testing.T) {
	ctx := context.Background()
	st, site := openForIncidents(t)
	var got []string
	p, _ := fakeProber(st, func(u string) (int, error) { got = append(got, u); return 200, nil })
	for _, d := range []string{"1.2.3.4:6379", "me@example.com", "example.com?x=1", "example.com#a", "", "example.com"} {
		p.probe(ctx, sqlite.SiteRow{ID: site, Domain: d})
	}
	if len(got) != 1 || got[0] != "https://example.com/" {
		t.Fatalf("fetched %v", got)
	}
}

func TestPlainDuration(t *testing.T) {
	for secs, want := range map[int64]string{20: "under a minute", 60: "1 minute", 600: "10 minutes", 3600: "1 hour", 5400: "1 hour 30 minutes", 7200: "2 hours", 3 * 86400: "3 days"} {
		if got := plainDuration(secs); got != want {
			t.Errorf("%d: %q want %q", secs, got, want)
		}
	}
}

func TestClassifyLooks(t *testing.T) {
	challenge := "<html><title>Just a moment...</title></html>"
	cases := []struct {
		name string
		l    look
		err  error
		want outcome
	}{
		{"200", look{Status: 200}, nil, outcomeUp},
		{"301", look{Status: 301}, nil, outcomeUp},
		{"401", look{Status: 401}, nil, outcomeUp},
		{"404", look{Status: 404}, nil, outcomeUp},
		{"403", look{Status: 403}, nil, outcomeBlocked},
		{"429", look{Status: 429}, nil, outcomeBlocked},
		{"cloudflare challenge header", look{Status: 200, Challenged: true}, nil, outcomeBlocked},
		{"cloudflare challenge 403", look{Status: 403, Challenged: true, Body: challenge}, nil, outcomeBlocked},
		{"challenge page on 503", look{Status: 503, Body: challenge}, nil, outcomeBlocked},
		{"503", look{Status: 503, Body: "maintenance"}, nil, outcomeDown},
		{"500", look{Status: 500}, nil, outcomeDown},
		{"520", look{Status: 520}, nil, outcomeDown},
		{"526", look{Status: 526}, nil, outcomeDown},
		{"timeout", look{}, context.DeadlineExceeded, outcomeDown},
		{"dns", look{}, &net.DNSError{IsNotFound: true}, outcomeDown},
		{"handshake", look{}, errors.New("tls: handshake failure"), outcomeDown},
	}
	for _, c := range cases {
		if got := classify(c.l, c.err); got != c.want {
			t.Errorf("%s: %d, want %d", c.name, got, c.want)
		}
	}
}

func TestBlockedLooksNeverMakeNorEndADown(t *testing.T) {
	ctx := context.Background()
	st, site := openForIncidents(t)
	p, clock := fakeProber(st, nil)
	answer := look{Status: 403}
	p.get = func(context.Context, string) (look, error) { return answer, nil }
	row := sqlite.SiteRow{ID: site, Domain: "a.com"}
	var told []string
	p.changed = func(_ context.Context, _ sqlite.SiteRow, before, after sqlite.SiteProbe) {
		switch {
		case !before.Down() && after.Down():
			told = append(told, "down")
		case before.Down() && after.Failures == 0:
			told = append(told, "up")
		}
	}
	for range 5 {
		p.probe(ctx, row)
		*clock += 300
	}
	got, _ := st.ProbeOf(ctx, site)
	if got.Down() || got.Failures != 0 || got.BlockedSince != 1_800_000_000 || got.Status != 403 || len(told) != 0 {
		t.Fatalf("blocked: %+v told %v", got, told)
	}
	// Two real failures make it down; a blocked look then neither ends it nor adds to it.
	answer = look{Status: 503}
	p.probe(ctx, row)
	*clock += 300
	p.probe(ctx, row)
	*clock += 300
	answer = look{Status: 429}
	p.probe(ctx, row)
	*clock += 300
	got, _ = st.ProbeOf(ctx, site)
	if !got.Down() || got.Failures != 2 || got.Error != "Your homepage answered 503" || got.BlockedSince == 0 {
		t.Fatalf("down then blocked: %+v", got)
	}
	// An answer ends the block, and the down with it.
	answer = look{Status: 200}
	p.probe(ctx, row)
	got, _ = st.ProbeOf(ctx, site)
	if got.Down() || got.BlockedSince != 0 || len(told) != 2 || told[0] != "down" || told[1] != "up" {
		t.Fatalf("answered: %+v told %v", got, told)
	}
	list, _ := st.ProbeLog(ctx, site, 20)
	if !list[len(list)-1].Blocked || list[0].Blocked {
		t.Fatalf("log: %+v", list)
	}
}
