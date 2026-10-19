package channels_test

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/channels"
	"github.com/trckable/trckable/server/internal/secrets"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

const (
	tokAccess  = "ACCESS-TOKEN-must-never-be-logged"
	tokRefresh = "REFRESH-TOKEN-must-never-be-logged"
)

// stub is a platform that answers from fields.
type stub struct {
	name     string
	backfill int
	stale    time.Duration
	before   time.Duration

	days    []channels.Day
	err     error
	refresh func(channels.Token) (channels.Token, error)

	from, to string
	pulls    int
	revoked  int
	asked    channels.Token
}

func (s *stub) Platform() string                        { return s.name }
func (s *stub) Configured() bool                        { return true }
func (s *stub) SignInURL(string, string, string) string { return "https://platform.example/consent" }
func (s *stub) Backfill() int                           { return s.backfill }
func (s *stub) MaxStale() time.Duration                 { return s.stale }
func (s *stub) RefreshBefore() time.Duration            { return s.before }
func (s *stub) Revoke(context.Context, channels.Token)  { s.revoked++ }
func (s *stub) Exchange(context.Context, string, string, string) (channels.Token, channels.Identity, error) {
	return channels.Token{}, channels.Identity{}, errors.New("not used")
}
func (s *stub) Refresh(_ context.Context, t channels.Token) (channels.Token, error) {
	if s.refresh != nil {
		return s.refresh(t)
	}
	return t, nil
}
func (s *stub) Daily(_ context.Context, t channels.Token, _ channels.Identity, from, to string) ([]channels.Day, error) {
	s.pulls++
	s.from, s.to, s.asked = from, to, t
	return s.days, s.err
}

type rig struct {
	st   *sqlite.Store
	m    *channels.Manager
	now  time.Time
	team string
	yt   *stub
	th   *stub
}

func newRig(t *testing.T) *rig {
	t.Helper()
	ctx := context.Background()
	st, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	box, _ := secrets.New([]byte("channels test instance key"))
	r := &rig{st: st, now: time.Now().UTC(), team: sqlite.DefaultAccount}
	r.yt = &stub{name: channels.YouTube, backfill: 90, stale: 28 * 24 * time.Hour}
	r.th = &stub{name: channels.Threads, backfill: 90, before: 14 * 24 * time.Hour}
	r.m = channels.New(st, box, r.yt, r.th)
	r.m.Now = func() time.Time { return r.now }
	return r
}

func (r *rig) connect(t *testing.T, platform, external string, exp time.Duration) sqlite.SocialAccount {
	t.Helper()
	a, err := r.m.Connect(context.Background(), r.team, platform, channels.Token{Access: secrets.NewSecret(tokAccess), Refresh: secrets.NewSecret(tokRefresh), Expires: r.now.Add(exp)}, channels.Identity{ID: external, Handle: "@" + external})
	if err != nil {
		t.Fatal(err)
	}
	return a
}

// ago is the day n days before the rig's now.
func (r *rig) ago(n int) string { return r.now.AddDate(0, 0, -n).Format(time.DateOnly) }

func (r *rig) count(t *testing.T, table string) int {
	t.Helper()
	var n int
	if err := r.st.DB.QueryRow("SELECT count(*) FROM " + table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestConnectSealsTheTokensAndConnectingAgainKeepsOneRow(t *testing.T) {
	r := newRig(t)
	a := r.connect(t, channels.YouTube, "UC1", time.Hour)
	b := r.connect(t, channels.YouTube, "UC1", 2*time.Hour)
	if a.ID != b.ID || r.count(t, "social_accounts") != 1 {
		t.Fatalf("a second sign-in made a second row: %s %s, %d rows", a.ID, b.ID, r.count(t, "social_accounts"))
	}
	if strings.Contains(b.AccessEnc, tokAccess) || strings.Contains(b.RefreshEnc, tokRefresh) || b.AccessEnc == "" {
		t.Errorf("the tokens are stored in the open: %q %q", b.AccessEnc, b.RefreshEnc)
	}
	// A sealed token copied into another row does not open there.
	r.connect(t, channels.YouTube, "UC2", time.Hour)
	all, _ := r.st.SocialAccountsAll(context.Background())
	swap := all[0]
	swap.AccessEnc = all[1].AccessEnc
	if err := r.st.SocialSetTokens(context.Background(), swap.ID, swap.AccessEnc, swap.RefreshEnc, swap.Expires); err != nil {
		t.Fatal(err)
	}
	moved, _ := r.st.SocialAccountOf(context.Background(), r.team, swap.ID)
	_ = r.m.Pull(context.Background(), moved)
	if after, _ := r.st.SocialAccountOf(context.Background(), r.team, swap.ID); after.LastError != channels.CodeDenied {
		t.Errorf("a token moved to another row opened: %q", after.LastError)
	}
}

func TestTheFirstPullReachesBackAndLaterOnesReadTheLastWeek(t *testing.T) {
	r := newRig(t)
	r.yt.days = []channels.Day{{Day: r.ago(2), Views: 5}, {Day: r.ago(1), Views: 7}}
	a := r.connect(t, channels.YouTube, "UC1", time.Hour)
	if err := r.m.Pull(context.Background(), a); err != nil {
		t.Fatal(err)
	}
	if r.yt.from != r.ago(90) || r.yt.to != r.ago(1) {
		t.Errorf("first pull %s..%s", r.yt.from, r.yt.to)
	}
	if r.yt.asked.Access.Reveal() != tokAccess {
		t.Error("the connector was not given the stored token")
	}
	a, _ = r.st.SocialAccountOf(context.Background(), r.team, a.ID)
	if a.LastOK == 0 || a.LastError != "" {
		t.Errorf("status after a good pull: %+v", a)
	}
	r.yt.days = []channels.Day{{Day: r.ago(1), Views: 9}} // revised
	if err := r.m.Pull(context.Background(), a); err != nil {
		t.Fatal(err)
	}
	if r.yt.from != r.ago(7) {
		t.Errorf("a later pull starts %s", r.yt.from)
	}
	rows, _ := r.st.SocialDaysOf(context.Background(), r.team, r.ago(100), r.ago(0))
	if len(rows) != 2 || rows[1].Views != 9 || rows[0].Views != 5 {
		t.Errorf("days %+v: the revised day replaces, the other stays", rows)
	}
}

func TestDisconnectDeletesTheTokensAndEveryDayAndOnlyThatAccounts(t *testing.T) {
	r := newRig(t)
	ctx := context.Background()
	r.yt.days = []channels.Day{{Day: r.ago(1), Views: 7}}
	r.th.days = []channels.Day{{Day: r.ago(1), Views: 3}}
	yt, th := r.connect(t, channels.YouTube, "UC1", time.Hour), r.connect(t, channels.Threads, "T1", 60*24*time.Hour)
	_ = r.m.Pull(ctx, yt)
	_ = r.m.Pull(ctx, th)
	other, _ := r.st.CreateAccount(ctx)
	if gone, err := r.m.Disconnect(ctx, other, yt.ID); gone || err != nil {
		t.Fatalf("another team disconnected an account: %v %v", gone, err)
	}
	if r.count(t, "social_daily") != 2 {
		t.Fatal("another team's disconnect deleted days")
	}
	if gone, err := r.m.Disconnect(ctx, r.team, yt.ID); !gone || err != nil {
		t.Fatalf("disconnect: %v %v", gone, err)
	}
	if r.yt.revoked != 1 {
		t.Error("the platform was not told")
	}
	if r.count(t, "social_accounts") != 1 || r.count(t, "social_daily") != 1 {
		t.Errorf("after disconnect: %d accounts, %d days", r.count(t, "social_accounts"), r.count(t, "social_daily"))
	}
	var left int
	_ = r.st.DB.QueryRow(`SELECT count(*) FROM social_daily WHERE social_id = ?`, yt.ID).Scan(&left)
	if left != 0 {
		t.Errorf("%d days of the disconnected account remain", left)
	}
}

func TestAPlatformTellingUsAPersonLeftDeletesTheirAccountsWhicheverTeamHoldsThem(t *testing.T) {
	r := newRig(t)
	ctx := context.Background()
	r.th.days = []channels.Day{{Day: r.ago(1), Views: 3}}
	a := r.connect(t, channels.Threads, "T1", time.Hour)
	_ = r.m.Pull(ctx, a)
	if _, err := r.st.SocialDeleteExternal(ctx, channels.Threads, "someone-else"); err != nil || r.count(t, "social_accounts") != 1 {
		t.Fatal("deleted another person's account")
	}
	if _, err := r.st.SocialDeleteExternal(ctx, channels.Threads, "T1"); err != nil {
		t.Fatal(err)
	}
	if r.count(t, "social_accounts") != 0 || r.count(t, "social_daily") != 0 {
		t.Error("the person's data remains")
	}
}

func TestYouTubeDataNotRefreshedInTimeIsDeletedAndTheAccountAsksToConnectAgain(t *testing.T) {
	r := newRig(t)
	ctx := context.Background()
	r.yt.days = []channels.Day{{Day: r.ago(5), Views: 7}}
	a := r.connect(t, channels.YouTube, "UC1", time.Hour)
	_ = r.m.Pull(ctx, a)
	// Google refuses from now on, for four weeks and a day.
	r.yt.err = channels.ErrDenied
	r.now = r.now.AddDate(0, 0, 29)
	r.m.Round(ctx)
	a, _ = r.st.SocialAccountOf(ctx, r.team, a.ID)
	if a.LastError != channels.CodeExpired || a.AccessEnc != "" || a.RefreshEnc != "" {
		t.Errorf("after the deadline: %+v", a)
	}
	if r.count(t, "social_daily") != 0 {
		t.Error("YouTube days outlived the deadline")
	}
	pulls := r.yt.pulls
	r.m.Round(ctx)
	if r.yt.pulls != pulls {
		t.Error("an account with no token was read")
	}
}

func TestARoundReadsEveryAccountAndALimitKeepsWhatWasThere(t *testing.T) {
	r := newRig(t)
	ctx := context.Background()
	r.yt.days = []channels.Day{{Day: r.ago(2), Views: 5}}
	r.th.days = []channels.Day{{Day: r.ago(2), Views: 2}}
	r.connect(t, channels.YouTube, "UC1", time.Hour)
	r.connect(t, channels.Threads, "T1", 60*24*time.Hour)
	r.m.Round(ctx)
	if r.count(t, "social_daily") != 2 {
		t.Fatalf("%d days after a round", r.count(t, "social_daily"))
	}
	r.yt.err = &channels.LimitError{Wait: time.Hour}
	r.m.Round(ctx)
	all, _ := r.st.SocialAccountsAll(ctx)
	for _, a := range all {
		if a.Platform == channels.YouTube && a.LastError != channels.CodeLimited {
			t.Errorf("limited account: %+v", a)
		}
		if a.Platform == channels.Threads && a.LastError != "" {
			t.Errorf("a healthy account: %+v", a)
		}
	}
	if r.count(t, "social_daily") != 2 {
		t.Error("a rate limit deleted days")
	}
	r.yt.err = channels.ErrDenied
	r.m.Round(ctx)
	all, _ = r.st.SocialAccountsAll(ctx)
	for _, a := range all {
		if a.Platform == channels.YouTube && a.LastError != channels.CodeDenied {
			t.Errorf("denied account: %+v", a)
		}
	}
}

func TestATokenNearItsEndIsRenewedAndTheNewOneIsKept(t *testing.T) {
	r := newRig(t)
	ctx := context.Background()
	r.th.days = []channels.Day{{Day: r.ago(2), Views: 2}}
	renewed := 0
	r.th.refresh = func(channels.Token) (channels.Token, error) {
		renewed++
		return channels.Token{Access: secrets.NewSecret("NEW-ACCESS-TOKEN"), Expires: r.now.Add(60 * 24 * time.Hour)}, nil
	}
	a := r.connect(t, channels.Threads, "T1", 5*24*time.Hour) // five days left, renew inside fourteen
	_ = r.m.Pull(ctx, a)
	if renewed != 1 || r.th.asked.Access.Reveal() != "NEW-ACCESS-TOKEN" {
		t.Errorf("renewed %d times, read with %q", renewed, r.th.asked.Access.Reveal())
	}
	a, _ = r.st.SocialAccountOf(ctx, r.team, a.ID)
	if a.Expires != r.now.Add(60*24*time.Hour).Unix() {
		t.Errorf("the new end was not kept: %d", a.Expires)
	}
	// A fresh token is not renewed again.
	_ = r.m.Pull(ctx, a)
	if renewed != 1 {
		t.Errorf("renewed again with sixty days left: %d", renewed)
	}
	// A failed renewal of a token that still works does not stop the pull.
	r.th.refresh = func(channels.Token) (channels.Token, error) { return channels.Token{}, errors.New("down") }
	b := r.connect(t, channels.Threads, "T2", 5*24*time.Hour)
	if err := r.m.Pull(ctx, b); err != nil {
		t.Errorf("the pull stopped for a failed renewal: %v", err)
	}
	// One that has ended does.
	c := r.connect(t, channels.Threads, "T3", -time.Hour)
	if err := r.m.Pull(ctx, c); err == nil {
		t.Error("an ended token that cannot be renewed was read")
	}
}

// No token reaches the log, whatever fails.
func TestNoTokenIsEverLogged(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	r := newRig(t)
	ctx := context.Background()
	yt := r.connect(t, channels.YouTube, "UC1", time.Hour)
	th := r.connect(t, channels.Threads, "T1", time.Hour)
	for _, err := range []error{channels.ErrDenied, &channels.LimitError{Wait: time.Hour}, &channels.APIError{Status: 500}, errors.New("channels: could not reach the platform")} {
		r.yt.err, r.th.err = err, err
		_ = r.m.Pull(ctx, yt)
		_ = r.m.Pull(ctx, th)
		r.m.Round(ctx)
	}
	r.th.refresh = func(channels.Token) (channels.Token, error) { return channels.Token{}, channels.ErrDenied }
	_ = r.m.Pull(ctx, th)
	_, _ = r.m.Disconnect(ctx, r.team, yt.ID)
	if buf.Len() == 0 {
		t.Fatal("nothing was logged: the test proves nothing")
	}
	for _, secret := range []string{tokAccess, tokRefresh, "must-never-be-logged"} {
		if strings.Contains(buf.String(), secret) {
			t.Errorf("the log holds a token:\n%s", buf.String())
		}
	}
	// And the types that hold them print as nothing.
	tok := channels.Token{Access: secrets.NewSecret(tokAccess), Refresh: secrets.NewSecret(tokRefresh)}
	buf.Reset()
	slog.Info("x", "token", tok, "access", tok.Access)
	if strings.Contains(buf.String(), "must-never") {
		t.Errorf("a Token logged itself: %s", buf.String())
	}
}
