package api

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/notice"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// nrig is a rig whose notices go to a recording mail server and bell.
type nrig struct {
	*rig
	owner *http.Client

	mu    sync.Mutex
	mails map[string][]string // address -> subjects
	bells []notice.BellEntry
}

const nPass = "correct horse battery"

func newNoticeRig(t *testing.T) *nrig {
	t.Helper()
	g := newRig(t)
	n := &nrig{rig: g, mails: map[string][]string{}}
	g.api.Notices = &notice.Hub{
		Store: g.ctl, BaseURL: "https://stats.example.com", Now: g.api.Now,
		Mail: func(_ context.Context, to string, r alerts.Report) error {
			n.mu.Lock()
			defer n.mu.Unlock()
			n.mails[to] = append(n.mails[to], r.Subject)
			return nil
		},
		Bell: bellRecorder(func(e notice.BellEntry) {
			n.mu.Lock()
			defer n.mu.Unlock()
			n.bells = append(n.bells, e)
		}),
	}
	g.ctl.RecoveryUsed = g.api.TellRecovery
	n.owner = client()
	g.setup(t, n.owner)
	return n
}

type bellRecorder func(notice.BellEntry)

func (f bellRecorder) Tell(_ context.Context, e notice.BellEntry) error { f(e); return nil }

// told waits for what is on its way and says what an address got.
func (n *nrig) told(to string) []string {
	n.api.Notices.Wait()
	n.mu.Lock()
	defer n.mu.Unlock()
	return append([]string(nil), n.mails[to]...)
}

// bell says which people were told of a kind in the bell, by id.
func (n *nrig) bell(kind string) [][]string {
	n.api.Notices.Wait()
	n.mu.Lock()
	defer n.mu.Unlock()
	var out [][]string
	for _, b := range n.bells {
		if b.Kind == kind {
			out = append(out, b.Users)
		}
	}
	return out
}

func (n *nrig) user(t *testing.T, email, role string) sqlite.Person {
	t.Helper()
	p, err := n.ctl.AddUser(context.Background(), sqlite.DefaultAccount, email, nPass+" 2", role)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func (n *nrig) me(t *testing.T) string {
	t.Helper()
	u, err := n.ctl.UserByEmail(context.Background(), "me@site.com")
	if err != nil {
		t.Fatal(err)
	}
	return u.ID
}

func hasSubject(subjects []string, part string) bool {
	for _, s := range subjects {
		if strings.Contains(s, part) {
			return true
		}
	}
	return false
}

func TestANewBrowserSignInIsToldOnlyToSomeoneWhoSignedInBefore(t *testing.T) {
	n := newNoticeRig(t)
	login := func(c *http.Client) {
		t.Helper()
		if code, out := do(t, c, "POST", n.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"`+nPass+`"}`); code != http.StatusOK {
			t.Fatalf("login: %d %v", code, out)
		}
	}
	first := client()
	login(first)
	if got := n.told("me@site.com"); len(got) != 0 {
		t.Fatalf("the first sign-in was news: %v", got)
	}
	login(first) // the same browser, remembered
	if got := n.told("me@site.com"); len(got) != 0 {
		t.Fatalf("a known browser was news: %v", got)
	}
	login(client())
	if got := n.told("me@site.com"); len(got) != 1 || !strings.Contains(got[0], "New sign-in") {
		t.Fatalf("a new browser: %v", got)
	}
	if b := n.bell(notice.NewDevice); len(b) != 1 || len(b[0]) != 1 || b[0][0] != n.me(t) {
		t.Fatalf("the bell: %v", b)
	}
}

func TestPasswordChangeResetAndTwoStepOffAreToldToThePerson(t *testing.T) {
	n := newNoticeRig(t)
	ada := n.user(t, "ada@site.com", sqlite.RoleViewer)

	// Their own change.
	c := client()
	if code, _ := do(t, c, "POST", n.srv.URL+"/api/v1/login", `{"email":"ada@site.com","password":"`+nPass+` 2"}`); code != http.StatusOK {
		t.Fatal("ada cannot sign in")
	}
	if code, out := do(t, c, "POST", n.srv.URL+"/api/v1/account/password", `{"current":"`+nPass+` 2","password":"ada's own long password"}`, csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("change: %d %v", code, out)
	}
	if got := n.told("ada@site.com"); !hasSubject(got, "password was changed") {
		t.Fatalf("a password change: %v", got)
	}
	if b := n.bell(notice.PasswordChanged); len(b) != 1 || b[0][0] != ada.ID {
		t.Fatalf("the bell: %v", b)
	}

	// An owner's reset.
	if code, _ := do(t, n.owner, "POST", n.srv.URL+"/api/v1/people/"+ada.ID+"/password", `{"password":"`+nPass+`"}`, csrf, "1"); code != http.StatusOK {
		t.Fatalf("reset: %d", code)
	}
	if got := n.told("ada@site.com"); !hasSubject(got, "reset your trckable password") {
		t.Fatalf("a reset: %v", got)
	}

	// An owner turning two-step off for her: she has it on first.
	if _, err := n.ctl.DB.ExecContext(context.Background(), `UPDATE users SET totp_enabled = 1, totp_secret = 'x' WHERE id = ?`, ada.ID); err != nil {
		t.Fatal(err)
	}
	if code, out := do(t, n.owner, "POST", n.srv.URL+"/api/v1/people/"+ada.ID+"/two-step/off", `{"password":"`+nPass+`"}`, csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("two-step off: %d %v", code, out)
	}
	if got := n.told("ada@site.com"); !hasSubject(got, "Two-step sign-in was turned off") {
		t.Fatalf("two-step off: %v", got)
	}
	// Nobody else is told what happened to her sign-in.
	if got := n.told("me@site.com"); hasSubject(got, "reset") || hasSubject(got, "Two-step") {
		t.Fatalf("an owner was told of someone else's sign-in: %v", got)
	}
}

func TestARecoveryCodeUseIsToldToThePerson(t *testing.T) {
	n := newNoticeRig(t)
	pw := `"` + nPass + `"`
	_, out := do(t, n.owner, "POST", n.srv.URL+"/api/v1/account/2fa/start", `{"password":`+pw+`}`, csrf, "1")
	secret := out["secret"].(string)
	code, _ := auth.TOTPCode(secret, n.now)
	_, out = do(t, n.owner, "POST", n.srv.URL+"/api/v1/account/2fa/enable", `{"password":`+pw+`,"code":"`+code+`"}`, csrf, "1")
	recovery := out["recovery"].([]any)

	// A sign-in with the app's code is not a recovery.
	n.advance(time.Minute)
	app, _ := auth.TOTPCode(secret, n.advance(0))
	if code, _ := do(t, client(), "POST", n.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"`+nPass+`","code":"`+app+`"}`); code != 200 {
		t.Fatalf("with the app's code: %d", code)
	}
	if got := n.told("me@site.com"); hasSubject(got, "recovery code") {
		t.Fatalf("told of a recovery code that was not used: %v", got)
	}
	if code, _ := do(t, client(), "POST", n.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"`+nPass+`","code":"`+recovery[0].(string)+`"}`); code != 200 {
		t.Fatalf("with a recovery code: %d", code)
	}
	if got := n.told("me@site.com"); !hasSubject(got, "recovery code was used") {
		t.Fatalf("a recovery code: %v", got)
	}
	if b := n.bell(notice.RecoveryCodeUsed); len(b) != 1 {
		t.Fatalf("the bell: %v", b)
	}
}

func TestKeysAreToldToEveryOwner(t *testing.T) {
	n := newNoticeRig(t)
	n.user(t, "two@site.com", sqlite.RoleOwner)
	n.user(t, "view@site.com", sqlite.RoleViewer)
	code, out := do(t, n.owner, "POST", n.srv.URL+"/api/v1/keys", `{"name":"ci"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("create: %d %v", code, out)
	}
	id := out["key"].(map[string]any)["id"].(string)
	for _, to := range []string{"me@site.com", "two@site.com"} {
		if got := n.told(to); !hasSubject(got, "API key was created") {
			t.Fatalf("%s after creating: %v", to, got)
		}
	}
	if code, _ := do(t, n.owner, "DELETE", n.srv.URL+"/api/v1/keys/"+id, "", csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("revoke: %d", code)
	}
	for _, to := range []string{"me@site.com", "two@site.com"} {
		if got := n.told(to); !hasSubject(got, "API key was revoked") {
			t.Fatalf("%s after revoking: %v", to, got)
		}
	}
	if got := n.told("view@site.com"); len(got) != 0 {
		t.Fatalf("a viewer was told about keys: %v", got)
	}
}

func TestTeamChangesAreToldToThePersonAndTheOwners(t *testing.T) {
	n := newNoticeRig(t)
	two := n.user(t, "two@site.com", sqlite.RoleOwner)
	view := n.user(t, "view@site.com", sqlite.RoleViewer)

	if code, _ := do(t, n.owner, "PATCH", n.srv.URL+"/api/v1/people/"+view.ID, `{"role":"viewer"}`, csrf, "1"); code != 200 {
		t.Fatalf("same role: %d", code)
	}
	if got := n.told("view@site.com"); len(got) != 0 {
		t.Fatalf("a role set to what it was is news: %v", got)
	}
	if code, _ := do(t, n.owner, "PATCH", n.srv.URL+"/api/v1/people/"+view.ID, `{"role":"owner"}`, csrf, "1"); code != 200 {
		t.Fatalf("promote: %d", code)
	}
	for _, to := range []string{"view@site.com", "two@site.com", "me@site.com"} {
		if got := n.told(to); !hasSubject(got, "role on the team changed") {
			t.Fatalf("%s after the role change: %v", to, got)
		}
	}
	if b := n.bell(notice.RoleChanged); len(b) != 1 || len(b[0]) != 3 {
		t.Fatalf("the bell: %v", b)
	}

	if code, _ := do(t, n.owner, "DELETE", n.srv.URL+"/api/v1/people/"+two.ID, "", csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("remove: %d", code)
	}
	for _, to := range []string{"two@site.com", "view@site.com", "me@site.com"} {
		if got := n.told(to); !hasSubject(got, "two@site.com was removed") {
			t.Fatalf("%s after the removal: %v", to, got)
		}
	}
}

func TestSitesAndDataChangesAreToldToTheOwnersByTheBell(t *testing.T) {
	n := newNoticeRig(t)
	n.user(t, "two@site.com", sqlite.RoleOwner)
	code, out := do(t, n.owner, "POST", n.srv.URL+"/api/v1/sites", `{"domain":"blog.acme-shop.dev"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("add: %d %v", code, out)
	}
	site := out["id"].(string)
	if b := n.bell(notice.SiteAdded); len(b) != 1 || len(b[0]) != 2 {
		t.Fatalf("site added: %v", b)
	}
	if code, out := do(t, n.owner, "DELETE", n.srv.URL+"/api/v1/sites/"+site, `{"domain":"blog.acme-shop.dev"}`, csrf, "1"); code != http.StatusOK {
		t.Fatalf("delete: %d %v", code, out)
	}
	if b := n.bell(notice.SiteRemoved); len(b) != 1 || len(b[0]) != 2 {
		t.Fatalf("site removed: %v", b)
	}
	if got := n.told("me@site.com"); len(got) != 0 {
		t.Fatalf("a bell-only notice was mailed: %v", got)
	}
}

func TestShorteningRetentionIsMailedAndLengtheningIsOnlyTheBell(t *testing.T) {
	n := newNoticeRig(t)
	set := func(days string) {
		t.Helper()
		if code, out := do(t, n.owner, "PUT", n.srv.URL+"/api/v1/sites/"+n.site+"/config", `{"retention_days":`+days+`}`, csrf, "1"); code != 200 {
			t.Fatalf("set %s: %d %v", days, code, out)
		}
	}
	set("365") // from keeping everything: a shorter time
	if got := n.told("me@site.com"); !hasSubject(got, "retention was shortened") {
		t.Fatalf("shortened: %v", got)
	}
	set("365") // unchanged
	set("730") // longer
	if got := n.told("me@site.com"); len(got) != 1 {
		t.Fatalf("a longer time was mailed: %v", got)
	}
	if b := n.bell(notice.RetentionChanged); len(b) != 1 {
		t.Fatalf("the bell for a longer time: %v", b)
	}
	if b := n.bell(notice.RetentionShorter); len(b) != 1 {
		t.Fatalf("the bell for a shorter time: %v", b)
	}
	n.mu.Lock()
	for _, e := range n.bells {
		if e.Kind == notice.RetentionShorter && (e.Vars["from_days"] != "0" || e.Vars["to_days"] != "365") {
			t.Errorf("the days the bell is told: %v", e.Vars)
		}
	}
	n.mu.Unlock()
	set("30")
	if got := n.told("me@site.com"); len(got) != 2 {
		t.Fatalf("shortened again: %v", got)
	}
}

func TestAnExportIsToldToTheOwners(t *testing.T) {
	n := newNoticeRig(t)
	resp, err := n.owner.Get(n.srv.URL + "/api/v1/sites/" + n.site + "/export.csv?from=2026-09-14&to=2026-09-20")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("export: %d", resp.StatusCode)
	}
	if b := n.bell(notice.DataExported); len(b) != 1 {
		t.Fatalf("the bell: %v", b)
	}
}

func TestChannelsConnectedAndDisconnectedAreToldToTheOwners(t *testing.T) {
	r := newChannels(t)
	n := &nrig{rig: r.rig, mails: map[string][]string{}}
	r.api.Notices = &notice.Hub{Store: r.ctl, Now: r.api.Now, Bell: bellRecorder(func(e notice.BellEntry) {
		n.mu.Lock()
		defer n.mu.Unlock()
		n.bells = append(n.bells, e)
	})}
	if back := r.connect(t, r.owner, "good-code"); back.StatusCode != http.StatusSeeOther {
		t.Fatalf("connect: %d", back.StatusCode)
	}
	if b := n.bell(notice.ChannelConnected); len(b) != 1 || len(b[0]) != 1 {
		t.Fatalf("connected: %v", b)
	}
	accts, err := r.ctl.SocialAccountsOf(context.Background(), sqlite.DefaultAccount)
	if err != nil || len(accts) != 1 {
		t.Fatalf("accounts: %v %v", accts, err)
	}
	if code, _ := do(t, r.owner, "DELETE", r.path("/accounts/"+accts[0].ID), "", csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("disconnect: %d", code)
	}
	if b := n.bell(notice.ChannelGone); len(b) != 1 {
		t.Fatalf("disconnected: %v", b)
	}
}

func TestAnInstallThatStoppedWorkingIsToldToTheManagersOncePerDay(t *testing.T) {
	n := newNoticeRig(t)
	n.user(t, "view@site.com", sqlite.RoleViewer)
	ctx := context.Background()
	good := installCheck{Found: "site"}
	gone := installCheck{Found: "none"}

	n.api.remember(ctx, n.site, "site.com", gone) // never worked: not news
	if got := n.told("me@site.com"); len(got) != 0 {
		t.Fatalf("a site that never worked: %v", got)
	}
	n.api.remember(ctx, n.site, "site.com", good)
	n.api.remember(ctx, n.site, "site.com", installCheck{Error: "site.com could not be reached over https"}) // unreachable says nothing about the snippet
	if got := n.told("me@site.com"); len(got) != 0 {
		t.Fatalf("an unreachable page: %v", got)
	}
	n.api.remember(ctx, n.site, "site.com", good)
	n.api.remember(ctx, n.site, "site.com", gone)
	if got := n.told("me@site.com"); len(got) != 1 || !strings.Contains(got[0], "cannot see site.com") {
		t.Fatalf("the snippet disappeared: %v", got)
	}
	n.mu.Lock()
	if len(n.bells) == 0 || n.bells[len(n.bells)-1].Vars["found"] != "none" {
		t.Errorf("what the bell is told: %+v", n.bells)
	}
	n.mu.Unlock()
	if got := n.told("view@site.com"); len(got) != 0 {
		t.Fatalf("a viewer was told: %v", got)
	}
	n.api.remember(ctx, n.site, "site.com", gone) // still gone: not told again
	if got := n.told("me@site.com"); len(got) != 1 {
		t.Fatalf("told again while still gone: %v", got)
	}
	n.api.remember(ctx, n.site, "site.com", good) // back and gone again the same day: the same notice
	n.api.remember(ctx, n.site, "site.com", gone)
	if got := n.told("me@site.com"); len(got) != 1 {
		t.Fatalf("one day, one notice: %v", got)
	}
	n.advance(26 * time.Hour)
	n.api.remember(ctx, n.site, "site.com", good)
	n.api.remember(ctx, n.site, "site.com", gone)
	if got := n.told("me@site.com"); len(got) != 2 {
		t.Fatalf("the next day: %v", got)
	}
}
