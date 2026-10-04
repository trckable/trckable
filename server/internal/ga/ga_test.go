package ga_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/url"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/ga"
	"github.com/trckable/trckable/server/internal/ga/gatest"
)

const redirect = "https://stats.example.com/api/v1/ga/callback"

func newClient(t *testing.T) (*ga.Client, *gatest.Fake) {
	t.Helper()
	f := gatest.New(t)
	f.RedirectURI = redirect
	c := &ga.Client{ID: gatest.ClientID, Secret: ga.NewSecret(gatest.ClientSecret)}
	f.Wire(c)
	return c, f
}

func TestSignInURLAsksForReadOnlyAndNoRefreshToken(t *testing.T) {
	c, _ := newClient(t)
	u, _ := url.Parse(c.SignInURL(redirect, "st", "verifier-verifier-verifier-verifier-verifier"))
	q := u.Query()
	if q.Get("scope") != ga.Scope || !strings.HasSuffix(ga.Scope, "analytics.readonly") {
		t.Errorf("scope %q", q.Get("scope"))
	}
	if q.Get("access_type") != "online" || q.Has("prompt") {
		t.Errorf("access_type %q, prompt %q: a refresh token must never be asked for", q.Get("access_type"), q.Get("prompt"))
	}
	if q.Get("redirect_uri") != redirect || q.Get("state") != "st" || q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "" {
		t.Errorf("query %v", q)
	}
	if q.Get("code_challenge") == "verifier-verifier-verifier-verifier-verifier" {
		t.Error("the verifier itself was sent as the challenge")
	}
}

func TestExchangeRefusesWhatGoogleRefusesAndSaysNothingOfIt(t *testing.T) {
	c, _ := newClient(t)
	_, _, err := c.Exchange(context.Background(), redirect, "made-up-code", "a-verifier-a-verifier-a-verifier-a-verifier")
	if err == nil {
		t.Fatal("a made-up code was accepted")
	}
	if strings.Contains(err.Error(), "made-up-code") || strings.Contains(err.Error(), gatest.ClientSecret) {
		t.Errorf("the error carries a secret: %v", err)
	}
	if _, _, err := c.Exchange(context.Background(), redirect, "", "v"); err == nil {
		t.Error("an empty code was accepted")
	}
}

func TestSecretNeverPrints(t *testing.T) {
	s := ga.NewSecret(gatest.AccessToken)
	var buf bytes.Buffer
	slog.New(slog.NewTextHandler(&buf, nil)).Info("x", "tok", s, "j", struct{ T ga.Secret }{s})
	js, _ := json.Marshal(map[string]any{"t": s})
	for _, out := range []string{buf.String(), fmt.Sprint(s), fmt.Sprintf("%v %+v %#v %s", s, s, s, s), string(js)} {
		if strings.Contains(out, "FAKE-ACCESS") {
			t.Errorf("the token printed: %s", out)
		}
	}
}

func TestPropertiesAndTheTokenGoesAsABearer(t *testing.T) {
	c, _ := newClient(t)
	if _, err := c.Properties(context.Background(), ga.NewSecret("wrong")); err != ga.ErrDenied {
		t.Fatalf("a wrong token: %v, want ErrDenied", err)
	}
	ps, err := c.Properties(context.Background(), ga.NewSecret(gatest.AccessToken))
	if err != nil || len(ps) != 2 || ps[0].ID != "properties/111" {
		t.Fatalf("%v %v", ps, err)
	}
}

func TestChunkTotalsEveryDayAndTopValuesCleaned(t *testing.T) {
	c, f := newClient(t)
	f.DataFrom = "2024-03-03" // nothing before it: those days are still totals, of zero
	rows, _, err := c.Chunk(context.Background(), ga.NewSecret(gatest.AccessToken), "properties/111", "2024-03-01", "2024-03-05")
	if err != nil {
		t.Fatal(err)
	}
	tot, by := map[string]ga.Row{}, map[string][]ga.Row{}
	for _, r := range rows {
		if r.Dim == "total" {
			tot[r.Day] = r
		} else if r.Day == "2024-03-04" {
			by[r.Dim] = append(by[r.Dim], r)
		}
	}
	if len(tot) != 5 || tot["2024-03-01"].Sessions != 0 || tot["2024-03-04"].Sessions != 14 || tot["2024-03-04"].Users != 12 || tot["2024-03-04"].Views != 42 {
		t.Errorf("totals %v", tot)
	}
	vals := func(dim string) []string {
		var v []string
		for _, r := range by[dim] {
			v = append(v, r.Value)
		}
		sort.Strings(v)
		return v
	}
	if got := fmt.Sprint(vals("page")); got != "[/ /pricing]" {
		t.Errorf("pages %s: the query string must be gone and its two rows one", got)
	}
	for _, r := range by["page"] {
		if r.Value == "/pricing" && r.Sessions != 14*7/10 {
			t.Errorf("/pricing sessions %d: the two query strings add up", r.Sessions)
		}
	}
	if got := fmt.Sprint(vals("source")); got != "[(direct) google]" {
		t.Errorf("sources %s: (not set) is not a source", got)
	}
	if got := fmt.Sprint(vals("device")); got != "[Desktop Mobile]" {
		t.Errorf("devices %s", got)
	}
	if got := fmt.Sprint(vals("country")); got != "[AL DE]" {
		t.Errorf("countries %s", got)
	}
}

func TestChunkPausesBeforeTheHourlyQuotaIsGone(t *testing.T) {
	c, f := newClient(t)
	f.Remaining = 10
	_, left, err := c.Chunk(context.Background(), ga.NewSecret(gatest.AccessToken), "properties/111", "2024-03-01", "2024-03-05")
	var q *ga.QuotaError
	if !asQuota(err, &q) || left != 10 {
		t.Fatalf("err %v, left %d: want a QuotaError with 10 tokens left", err, left)
	}
}

func TestThrottledRequestsAreRetriedThenPause(t *testing.T) {
	c, f := newClient(t)
	f.Throttle = 2
	if _, _, err := c.Chunk(context.Background(), ga.NewSecret(gatest.AccessToken), "properties/111", "2024-03-01", "2024-03-02"); err != nil {
		t.Fatalf("two throttled answers should be waited out: %v", err)
	}
	f.Throttle = 100
	_, _, err := c.Chunk(context.Background(), ga.NewSecret(gatest.AccessToken), "properties/111", "2024-03-01", "2024-03-02")
	var q *ga.QuotaError
	if !asQuota(err, &q) {
		t.Fatalf("a property that stays throttled: %v, want a QuotaError", err)
	}
}

func TestChunkRefusesAnythingButAProperty(t *testing.T) {
	c, f := newClient(t)
	for _, p := range []string{"properties/1/../../x", "accounts/1", "properties/", "properties/1?x=1", ""} {
		if _, _, err := c.Chunk(context.Background(), ga.NewSecret(gatest.AccessToken), p, "2024-03-01", "2024-03-02"); err != ga.ErrBadProperty {
			t.Errorf("%q: %v", p, err)
		}
	}
	if f.Requests != 0 {
		t.Errorf("%d requests were sent for ids that are not properties", f.Requests)
	}
}

func asQuota(err error, into **ga.QuotaError) bool {
	q, ok := err.(*ga.QuotaError)
	*into = q
	return ok
}

// memSink is DuckDB's replace-the-range, in memory.
type memSink struct {
	mu   sync.Mutex
	rows map[string]ga.Row // day|dim|value
	fail error
}

func (m *memSink) Replace(_ context.Context, _, from, to string, rows []ga.Row) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.fail != nil {
		return m.fail
	}
	if m.rows == nil {
		m.rows = map[string]ga.Row{}
	}
	for k, r := range m.rows {
		if r.Day >= from && r.Day <= to {
			delete(m.rows, k)
		}
	}
	for _, r := range rows {
		m.rows[r.Day+"|"+r.Dim+"|"+r.Value] = r
	}
	return nil
}

func (m *memSink) Have(_ context.Context, _, from, to string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	a, _ := time.Parse("2006-01-02", from)
	b, _ := time.Parse("2006-01-02", to)
	for d := a; !d.After(b); d = d.AddDate(0, 0, 1) {
		if _, ok := m.rows[d.Format("2006-01-02")+"|total|"]; !ok {
			return false, nil
		}
	}
	return true, nil
}

func (m *memSink) sum() (n, sessions uint64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, r := range m.rows {
		if r.Dim == "total" {
			n++
			sessions += r.Sessions
		}
	}
	return
}

func wait(t *testing.T, m *ga.Manager, site string, want ...string) ga.Snapshot {
	t.Helper()
	for i := 0; i < 500; i++ {
		if s, ok := m.Status(site, "u1"); ok {
			for _, w := range want {
				if s.Status == w {
					return s
				}
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	s, _ := m.Status(site, "u1")
	t.Fatalf("the import never reached %v: %+v", want, s)
	return s
}

func newManager(t *testing.T) (*ga.Manager, *gatest.Fake, *memSink) {
	t.Helper()
	c, f := newClient(t)
	sink := &memSink{}
	m := &ga.Manager{Client: c, Sink: sink}
	t.Cleanup(m.Stop)
	m.Hold("a1", "s1", "u1", ga.NewSecret(gatest.AccessToken), time.Now().Add(time.Hour))
	return m, f, sink
}

func TestImportRunsAndRunningItAgainChangesNothing(t *testing.T) {
	m, f, sink := newManager(t)
	f.DataFrom = "2024-01-01"
	if _, err := m.Start("s1", "u1", "properties/111", "2024-01-01", "2024-04-30", false); err != nil {
		t.Fatal(err)
	}
	s := wait(t, m, "s1", ga.Done)
	if s.Done != s.Total || s.Total != 3 || s.Days != 121 {
		t.Errorf("progress %+v", s)
	}
	days, sessions := sink.sum()
	// The token is gone with the finished import.
	if _, ok := m.Token("s1", "u1"); ok {
		t.Error("the token outlived the import")
	}
	m.Hold("a1", "s1", "u1", ga.NewSecret(gatest.AccessToken), time.Now().Add(time.Hour))
	if _, err := m.Start("s1", "u1", "properties/111", "2024-01-01", "2024-04-30", false); err != nil {
		t.Fatal(err)
	}
	wait(t, m, "s1", ga.Done)
	if d2, s2 := sink.sum(); d2 != days || s2 != sessions {
		t.Errorf("a second run: %d days %d sessions, was %d and %d", d2, s2, days, sessions)
	}
}

func TestQuotaPausesAndResumeSkipsWhatIsDone(t *testing.T) {
	m, f, _ := newManager(t)
	f.DataFrom = "2024-01-01"
	if _, err := m.Start("s1", "u1", "properties/111", "2024-01-01", "2024-04-30", false); err != nil {
		t.Fatal(err)
	}
	wait(t, m, "s1", ga.Done)
	// Start over with the first chunk done and Google throttling.
	m.Hold("a1", "s1", "u1", ga.NewSecret(gatest.AccessToken), time.Now().Add(time.Hour))
	f.Throttle = 1000
	f.Requests = 0
	if _, err := m.Start("s1", "u1", "properties/111", "2024-01-01", "2024-07-31", false); err != nil {
		t.Fatal(err)
	}
	s := wait(t, m, "s1", ga.Paused)
	if s.Code != ga.CodeQuota || s.RetryAt.IsZero() {
		t.Errorf("paused with %+v", s)
	}
	f.Throttle = 0
	f.Requests = 0
	if _, err := m.Resume("s1", "u1"); err != nil {
		t.Fatal(err)
	}
	s = wait(t, m, "s1", ga.Done)
	// Three chunks were there; the other two are fetched, one request for a
	// chunk's totals and five for its dimensions.
	if f.Requests != 2*6 {
		t.Errorf("%d requests, want 12: the chunks that were done are not fetched again", f.Requests)
	}
	if s.Done != s.Total {
		t.Errorf("%+v", s)
	}
}

func TestDeniedEndsTheSignIn(t *testing.T) {
	m, f, _ := newManager(t)
	f.Denied = true
	if _, err := m.Start("s1", "u1", "properties/111", "2024-01-01", "2024-01-10", false); err != nil {
		t.Fatal(err)
	}
	s := wait(t, m, "s1", ga.Denied)
	if s.Code != ga.CodeDenied {
		t.Errorf("%+v", s)
	}
	if _, ok := m.Token("s1", "u1"); ok {
		t.Error("a refused token was kept")
	}
}

func TestOnlyTheSignedInPersonUsesTheTokenAndSeesTheJob(t *testing.T) {
	m, _, _ := newManager(t)
	if _, ok := m.Token("s1", "someone-else"); ok {
		t.Error("another person got the token")
	}
	if _, ok := m.Token("s2", "u1"); ok {
		t.Error("another site got the token")
	}
	if _, err := m.Start("s1", "someone-else", "properties/111", "2024-01-01", "2024-01-10", false); err != ga.ErrNotSignedIn {
		t.Errorf("another person started an import: %v", err)
	}
	if _, err := m.Start("s1", "u1", "properties/111", "2024-01-01", "2024-01-10", false); err != nil {
		t.Fatal(err)
	}
	wait(t, m, "s1", ga.Done, ga.Paused)
	if _, ok := m.Status("s1", "someone-else"); ok {
		t.Error("another person saw the import")
	}
}

func TestAnExpiredTokenIsNotUsed(t *testing.T) {
	c, _ := newClient(t)
	m := &ga.Manager{Client: c, Sink: &memSink{}}
	t.Cleanup(m.Stop)
	m.Hold("a1", "s1", "u1", ga.NewSecret(gatest.AccessToken), time.Now().Add(-time.Minute))
	if _, err := m.Start("s1", "u1", "properties/111", "2024-01-01", "2024-01-10", false); err != ga.ErrNotSignedIn {
		t.Errorf("%v", err)
	}
}

func TestTheTokenIsNeverLoggedOrShownByAnImport(t *testing.T) {
	var logs bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(old) })
	m, f, sink := newManager(t)
	sink.fail = fmt.Errorf("the store said no")
	if _, err := m.Start("s1", "u1", "properties/111", "2024-01-01", "2024-01-10", false); err != nil {
		t.Fatal(err)
	}
	s := wait(t, m, "s1", ga.Paused)
	sink.fail = nil
	m.Hold("a1", "s1", "u1", ga.NewSecret(gatest.AccessToken), time.Now().Add(time.Hour))
	f.Denied = false
	js, _ := json.Marshal(s)
	if strings.Contains(string(js), "FAKE-ACCESS") || strings.Contains(logs.String(), "FAKE-ACCESS") || strings.Contains(logs.String(), gatest.ClientSecret) {
		t.Errorf("a secret leaked:\n%s\n%s", js, logs.String())
	}
	if s.Code != ga.CodeFailed {
		t.Errorf("a store failure is %q", s.Code)
	}
}

func TestOnlyOneImportPerSite(t *testing.T) {
	m, f, _ := newManager(t)
	f.DataFrom = "2024-01-01"
	// A slow Google: the first import is still running when the second starts.
	block := make(chan struct{})
	m.Client.Sleep = func(ctx context.Context, _ time.Duration) error {
		select {
		case <-block:
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	m.Client.Pace = time.Millisecond
	if _, err := m.Start("s1", "u1", "properties/111", "2024-01-01", "2024-09-30", false); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Start("s1", "u1", "properties/111", "2024-01-01", "2024-09-30", false); err != ga.ErrRunning {
		t.Errorf("a second import of the same site: %v", err)
	}
	close(block)
}

func TestHeldSignInsAreBoundedPerAccountAndKeptPerPerson(t *testing.T) {
	m := &ga.Manager{Client: &ga.Client{}, Sink: &memSink{}}
	t.Cleanup(m.Stop)
	exp := time.Now().Add(time.Hour)
	// Two owners of one site do not replace each other.
	m.Hold("a1", "s1", "u1", ga.NewSecret("t1"), exp)
	m.Hold("a1", "s1", "u2", ga.NewSecret("t2"), exp)
	if tok, ok := m.Token("s1", "u1"); !ok || tok.Reveal() != "t1" {
		t.Error("the second owner's sign-in replaced the first's")
	}
	if tok, ok := m.Token("s1", "u2"); !ok || tok.Reveal() != "t2" {
		t.Error("the second owner has no sign-in")
	}
	// One account holds ten; the oldest makes room, and another account is untouched.
	m.Hold("b1", "sb", "ub", ga.NewSecret("tb"), exp)
	for i := 0; i < 12; i++ {
		if !m.Hold("a1", fmt.Sprintf("site%d", i), "u1", ga.NewSecret("x"), exp) {
			t.Fatal("a sign-in was refused although the account may drop its oldest")
		}
		time.Sleep(time.Millisecond)
	}
	if _, ok := m.Token("s1", "u1"); ok {
		t.Error("the oldest sign-in was kept past the cap")
	}
	if _, ok := m.Token("site11", "u1"); !ok {
		t.Error("the newest sign-in was dropped")
	}
	if _, ok := m.Token("sb", "ub"); !ok {
		t.Error("one account's sign-ins pushed out another's")
	}
}
