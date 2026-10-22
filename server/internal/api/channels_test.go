package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/channels"
	"github.com/trckable/trckable/server/internal/secrets"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

const chAccess, chRefresh = "CH-ACCESS-TOKEN-FAKE", "CH-REFRESH-TOKEN-FAKE"

// chPlatform is a YouTube that signs anyone in as one channel.
type chPlatform struct {
	days     []channels.Day
	revoked  int
	exchange int
}

func (c *chPlatform) Platform() string { return channels.YouTube }
func (c *chPlatform) Configured() bool { return true }
func (c *chPlatform) SignInURL(redirect, state, _ string) string {
	return "https://accounts.example/consent?" + url.Values{"redirect_uri": {redirect}, "state": {state}}.Encode()
}
func (c *chPlatform) Exchange(_ context.Context, _, code, _ string) (channels.Token, channels.Identity, error) {
	c.exchange++
	if code != "good-code" {
		return channels.Token{}, channels.Identity{}, channels.ErrDenied
	}
	return channels.Token{Access: secrets.NewSecret(chAccess), Refresh: secrets.NewSecret(chRefresh), Expires: time.Now().Add(time.Hour)}, channels.Identity{ID: "UC1", Handle: "@maker"}, nil
}
func (c *chPlatform) Refresh(_ context.Context, t channels.Token) (channels.Token, error) {
	return t, nil
}
func (c *chPlatform) Daily(context.Context, channels.Token, channels.Identity, string, string) ([]channels.Day, error) {
	return c.days, nil
}
func (c *chPlatform) Revoke(context.Context, channels.Token) { c.revoked++ }
func (c *chPlatform) Backfill() int                          { return 90 }
func (c *chPlatform) MaxStale() time.Duration                { return 28 * 24 * time.Hour }
func (c *chPlatform) RefreshBefore() time.Duration           { return 0 }

type chRig struct {
	*rig
	yt     *chPlatform
	owner  *http.Client
	viewer *http.Client
}

func newChannels(t *testing.T) *chRig {
	t.Helper()
	g := newRig(t)
	g.setup(t, client())
	yt := &chPlatform{days: []channels.Day{{Day: "2026-08-01", Views: 40}, {Day: "2026-09-19", Views: 100}, {Day: "2026-09-21", Views: 23}}}
	g.api.BaseURL = g.srv.URL
	g.api.Channels = channels.New(g.ctl, g.api.Box, yt)
	g.api.Channels.Now = g.api.Now
	t.Cleanup(g.api.Channels.Wait)
	r := &chRig{rig: g, yt: yt, owner: stepper(), viewer: stepper()}
	if code, out := do(t, r.owner, "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery"}`); code != http.StatusOK {
		t.Fatalf("owner signs in: %d %v", code, out)
	}
	if _, err := g.ctl.AddUser(context.Background(), sqlite.DefaultAccount, "viewer@site.com", "correct horse battery V", sqlite.RoleViewer); err != nil {
		t.Fatal(err)
	}
	if code, out := do(t, r.viewer, "POST", g.srv.URL+"/api/v1/login", `{"email":"viewer@site.com","password":"correct horse battery V"}`); code != http.StatusOK {
		t.Fatalf("viewer signs in: %d %v", code, out)
	}
	return r
}

func (r *chRig) path(p string) string { return r.srv.URL + "/api/v1/channels" + p }

// list reads the cards and checks no answer holds a token.
func (r *chRig) list(t *testing.T, c *http.Client, days string) map[string]any {
	t.Helper()
	req, _ := http.NewRequest("GET", r.path("?days="+days), nil)
	res, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("list: %d %s", res.StatusCode, raw)
	}
	noTokens(t, string(raw))
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	return out
}

func noTokens(t *testing.T, s string) {
	t.Helper()
	for _, secret := range []string{chAccess, chRefresh, "access_enc", "refresh_enc", "v1:"} {
		if strings.Contains(s, secret) {
			t.Errorf("an answer carries %q: %s", secret, s)
		}
	}
}

func card(t *testing.T, out map[string]any, platform string) map[string]any {
	t.Helper()
	for _, p := range out["platforms"].([]any) {
		if m := p.(map[string]any); m["platform"] == platform {
			return m
		}
	}
	t.Fatalf("no %s card in %v", platform, out)
	return nil
}

// connect walks start, the platform and the callback; it answers the callback.
func (r *chRig) connect(t *testing.T, c *http.Client, code string) hop {
	t.Helper()
	start := fetch(t, c, r.path("/youtube/start"))
	if start.StatusCode != http.StatusSeeOther {
		t.Fatalf("start: %d", start.StatusCode)
	}
	consent, _ := url.Parse(start.Header.Get("Location"))
	if consent.Host != "accounts.example" || consent.Query().Get("redirect_uri") != r.srv.URL+"/api/v1/channels/youtube/callback" {
		t.Fatalf("the browser was sent to %s", consent)
	}
	return fetch(t, c, r.path("/youtube/callback?code="+code+"&state="+url.QueryEscape(consent.Query().Get("state"))))
}

func TestChannelsConnectShowTheCardAndDisconnectDeletesTheData(t *testing.T) {
	r := newChannels(t)
	ctx := context.Background()

	// Nothing connected: YouTube can be connected, the others have no keys here.
	out := r.list(t, r.owner, "30")
	yt := card(t, out, "youtube")
	if yt["ready"] != true || yt["views"] != nil || len(yt["accounts"].([]any)) != 0 {
		t.Fatalf("before connecting: %v", yt)
	}
	if ig := card(t, out, "instagram"); ig["ready"] != false {
		t.Errorf("a platform with no keys is offered: %v", ig)
	}

	back := r.connect(t, r.owner, "good-code")
	if back.StatusCode != http.StatusSeeOther || back.Header.Get("Location") != "/sites?channel=youtube&connected=1" {
		t.Fatalf("the callback sent the browser to %d %q", back.StatusCode, back.Header.Get("Location"))
	}
	r.api.Channels.Wait()

	yt = card(t, r.list(t, r.owner, "30"), "youtube")
	accts := yt["accounts"].([]any)
	if len(accts) != 1 || accts[0].(map[string]any)["handle"] != "@maker" || yt["monitoring"] != float64(1) {
		t.Fatalf("after connecting: %v", yt)
	}
	// The period is 30 days to the 21st: the 19th and 21st count, 1 August is the period before.
	if yt["views"] != float64(123) || yt["previous"] != float64(40) {
		t.Errorf("views %v previous %v", yt["views"], yt["previous"])
	}
	if series := yt["series"].([]any); len(series) != 2 {
		t.Errorf("series %v", series)
	}
	// 90 days reach back before the account's first day of numbers: told so,
	// and no change is claimed.
	long := card(t, r.list(t, r.owner, "90"), "youtube")
	if long["from"] == nil || long["previous"] != nil {
		t.Errorf("a period longer than the history: %v", long)
	}

	// A viewer reads the numbers and cannot connect or disconnect.
	if v := card(t, r.list(t, r.viewer, "30"), "youtube"); v["views"] != float64(123) {
		t.Errorf("a viewer sees %v", v)
	}
	if res := fetch(t, r.viewer, r.path("/youtube/start")); res.StatusCode != http.StatusForbidden {
		t.Errorf("a viewer started a sign-in: %d", res.StatusCode)
	}
	id := accts[0].(map[string]any)["id"].(string)
	if code, _ := do(t, r.viewer, "DELETE", r.path("/accounts/"+id), "", csrf, "1"); code != http.StatusForbidden {
		t.Errorf("a viewer disconnected an account: %d", code)
	}

	// Disconnecting deletes the account, its tokens and every day.
	if code, out := do(t, r.owner, "DELETE", r.path("/accounts/"+id), "", csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("disconnect: %d %v", code, out)
	}
	if r.yt.revoked != 1 {
		t.Error("the platform was not told")
	}
	for _, table := range []string{"social_accounts", "social_daily"} {
		var n int
		if err := r.ctl.DB.QueryRowContext(ctx, "SELECT count(*) FROM "+table).Scan(&n); err != nil || n != 0 {
			t.Errorf("%s holds %d rows after disconnecting (%v)", table, n, err)
		}
	}
	if yt = card(t, r.list(t, r.owner, "30"), "youtube"); yt["views"] != nil || len(yt["accounts"].([]any)) != 0 {
		t.Errorf("the card after disconnecting: %v", yt)
	}
	if code, _ := do(t, r.owner, "DELETE", r.path("/accounts/"+id), "", csrf, "1"); code != http.StatusNotFound {
		t.Errorf("disconnecting twice: %d", code)
	}
}

func TestChannelsRefuseASignInThatIsNotTheOnesThatStarted(t *testing.T) {
	r := newChannels(t)
	// The person said no.
	start := fetch(t, r.owner, r.path("/youtube/start"))
	consent, _ := url.Parse(start.Header.Get("Location"))
	st := url.QueryEscape(consent.Query().Get("state"))
	if back := fetch(t, r.owner, r.path("/youtube/callback?error=access_denied&state="+st)); back.Header.Get("Location") != "/sites?channel=youtube&channel_error=denied" {
		t.Errorf("a refused consent went to %q", back.Header.Get("Location"))
	}
	// The cookie is spent: the same answer again leads nowhere.
	if back := fetch(t, r.owner, r.path("/youtube/callback?code=good-code&state="+st)); back.Header.Get("Location") != "/sites" || r.yt.exchange != 0 {
		t.Errorf("a repeated callback: %q, exchanged %d", back.Header.Get("Location"), r.yt.exchange)
	}
	// Another state.
	fetch(t, r.owner, r.path("/youtube/start"))
	if back := fetch(t, r.owner, r.path("/youtube/callback?code=good-code&state=forged")); back.Header.Get("Location") != "/sites?channel=youtube&channel_error=failed" || r.yt.exchange != 0 {
		t.Errorf("a forged state: %q, exchanged %d", back.Header.Get("Location"), r.yt.exchange)
	}
	// The platform did not accept the code.
	if back := r.connect(t, r.owner, "bad-code"); back.Header.Get("Location") != "/sites?channel=youtube&channel_error=failed" {
		t.Errorf("a bad code: %q", back.Header.Get("Location"))
	}
	// Without a callback cookie of its own (another browser), nothing is kept.
	if back := fetch(t, stepper(), r.path("/youtube/callback?code=good-code&state=x")); back.StatusCode != http.StatusUnauthorized {
		t.Errorf("an anonymous callback: %d", back.StatusCode)
	}
	var n int
	_ = r.ctl.DB.QueryRow("SELECT count(*) FROM social_accounts").Scan(&n)
	if n != 0 {
		t.Errorf("%d accounts were kept", n)
	}
}

func TestChannelsWithoutKeysOfferNothingToConnect(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	g.api.Channels = channels.New(g.ctl, g.api.Box, &channels.YouTubeConnector{})
	owner := stepper()
	do(t, owner, "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery"}`)
	if res := fetch(t, owner, g.srv.URL+"/api/v1/channels/youtube/start"); res.StatusCode != http.StatusNotFound {
		t.Errorf("starting without keys: %d", res.StatusCode)
	}
	code, out := do(t, owner, "GET", g.srv.URL+"/api/v1/channels", "")
	if code != http.StatusOK {
		t.Fatalf("list: %d %v", code, out)
	}
	for _, p := range out["platforms"].([]any) {
		if p.(map[string]any)["ready"] != false {
			t.Errorf("offered without keys: %v", p)
		}
	}
	if out["setup_docs"] != true {
		t.Errorf("a self-hosted instance points at its setup docs: %v", out["setup_docs"])
	}
	g.api.Managed = true
	_, out = do(t, owner, "GET", g.srv.URL+"/api/v1/channels", "")
	if out["setup_docs"] != false {
		t.Errorf("a managed instance has no setup docs to show: %v", out["setup_docs"])
	}
}

func TestADeauthorizationFromAnythingButMetaIsRefused(t *testing.T) {
	r := newChannels(t)
	for _, platform := range []string{"youtube", "instagram", "x"} {
		req, _ := http.NewRequest("POST", r.path("/"+platform+"/deauth"), strings.NewReader("signed_request=abc.def"))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != http.StatusBadRequest {
			t.Errorf("%s: %d", platform, res.StatusCode)
		}
	}
}
