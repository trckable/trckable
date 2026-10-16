package api

import (
	"context"
	"github.com/trckable/trckable/server/internal/mailkit"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

var codeInSubject = regexp.MustCompile(`(\d{3}) (\d{3})`)

// mailbox makes the rig's server send sign-in emails into a channel.
func mailbox(g *rig) chan alerts.Report {
	box := make(chan alerts.Report, 16)
	g.api.SendLoginMail = func(_ context.Context, to string, r alerts.Report) error {
		r.FromName = to // the test reads who it went to here
		box <- r
		return nil
	}
	return box
}

func nextCode(t *testing.T, box chan alerts.Report) string {
	t.Helper()
	select {
	case r := <-box:
		m := codeInSubject.FindStringSubmatch(r.Subject)
		if m == nil || !strings.Contains(r.Text, m[0]) || !strings.Contains(r.HTML, m[1]+m[2]) {
			t.Fatalf("the email has no code: %q", r.Subject)
		}
		return m[1] + m[2]
	case <-time.After(3 * time.Second):
		t.Fatal("no email was sent")
	}
	return ""
}

func noMail(t *testing.T, box chan alerts.Report) {
	t.Helper()
	select {
	case r := <-box:
		t.Fatalf("an email was sent to %s", r.FromName)
	case <-time.After(150 * time.Millisecond):
	}
}

func (g *rig) askCode(t *testing.T, email string) (int, map[string]any) {
	t.Helper()
	return do(t, client(), "POST", g.srv.URL+"/api/v1/login/code", `{"email":"`+email+`"}`)
}

func (g *rig) verifyCode(t *testing.T, c *http.Client, body string) (int, map[string]any) {
	t.Helper()
	return do(t, c, "POST", g.srv.URL+"/api/v1/login/code/verify", body)
}

func bearer(t *testing.T, token, method, url string) (int, map[string]any) {
	t.Helper()
	return do(t, http.DefaultClient, method, url, ``, "Authorization", "Bearer "+token, csrf, "1")
}

const deviceBody = `,"device":{"name":"Albi's iPhone","platform":"ios"}`

func TestEmailCodeSignsAPhoneIn(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	box := mailbox(g)

	if _, out := do(t, client(), "GET", g.srv.URL+"/api/v1/setup", ""); out["email_codes"] != true {
		t.Fatalf("the setup answer does not say codes can be sent: %v", out)
	}
	code, out := g.askCode(t, "Me@Site.com")
	if code != http.StatusAccepted {
		t.Fatalf("ask: %d %v", code, out)
	}
	c := nextCode(t, box)

	phone := client()
	code, out = g.verifyCode(t, phone, `{"email":"me@site.com","code":"`+c[:3]+` `+c[3:]+`"`+deviceBody+`}`)
	if code != http.StatusOK {
		t.Fatalf("verify: %d %v", code, out)
	}
	token, _ := out["token"].(string)
	if !strings.HasPrefix(token, sqlite.DeviceTokenPrefix) {
		t.Fatalf("no device token: %v", out)
	}
	if cs := phone.Jar.Cookies(mustURL(g.srv.URL)); len(cs) != 0 {
		t.Fatalf("a device sign-in set a cookie: %v", cs)
	}
	if code, out := bearer(t, token, "GET", g.srv.URL+"/api/v1/me"); code != http.StatusOK || out["email"] != "me@site.com" || out["role"] != "owner" {
		t.Fatalf("the token does not act as the owner: %d %v", code, out)
	}
	code, out = bearer(t, token, "GET", g.srv.URL+"/api/v1/me/devices")
	list, _ := out["devices"].([]any)
	if code != http.StatusOK || len(list) != 1 {
		t.Fatalf("devices: %d %v", code, out)
	}
	d := list[0].(map[string]any)
	if d["name"] != "Albi's iPhone" || d["platform"] != "ios" || d["current"] != true {
		t.Fatalf("the device: %v", d)
	}
	for _, k := range []string{"token", "token_hash"} {
		if _, ok := d[k]; ok {
			t.Fatalf("the list carries %s", k)
		}
	}
	// A device can read and change like the person (no CSRF header needed: it
	// is no cookie).
	if code, _ := do(t, http.DefaultClient, "PATCH", g.srv.URL+"/api/v1/sites/"+g.site, `{"name":"Renamed"}`, "Authorization", "Bearer "+token); code != http.StatusOK {
		t.Fatalf("a change by the owner's device: %d", code)
	}
	// Used once.
	if code, _ := g.verifyCode(t, client(), `{"email":"me@site.com","code":"`+c+`"}`); code != http.StatusUnauthorized {
		t.Fatalf("the same code twice: %d", code)
	}
}

func TestEmailCodeWithoutDeviceIsABrowserSession(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	box := mailbox(g)
	g.askCode(t, "me@site.com")
	web := client()
	code, out := g.verifyCode(t, web, `{"email":"me@site.com","code":"`+nextCode(t, box)+`"}`)
	if code != http.StatusOK || out["token"] != nil {
		t.Fatalf("verify: %d %v", code, out)
	}
	if code, out := do(t, web, "GET", g.srv.URL+"/api/v1/me", ""); code != http.StatusOK || out["email"] != "me@site.com" {
		t.Fatalf("the session: %d %v", code, out)
	}
}

func TestEmailCodeAsksTellNothingAboutWho(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	box := mailbox(g)
	c1, o1 := g.askCode(t, "me@site.com")
	nextCode(t, box)
	c2, o2 := g.askCode(t, "nobody@site.com")
	noMail(t, box)
	if c1 != http.StatusAccepted || c1 != c2 || len(o1) != len(o2) || o1["ok"] != o2["ok"] {
		t.Fatalf("a known and an unknown address answer differently: %d %v / %d %v", c1, o1, c2, o2)
	}
	// Verifying: unknown address, wrong code, no code asked: all one answer.
	_, k := g.verifyCode(t, client(), `{"email":"me@site.com","code":"000000"}`)
	cu, u := g.verifyCode(t, client(), `{"email":"nobody@site.com","code":"000000"}`)
	if cu != http.StatusUnauthorized || k["error"] != u["error"] || len(k) != len(u) {
		t.Fatalf("verify answers differ: %v / %d %v", k, cu, u)
	}
}

func TestEmailCodeNeedsAMailServer(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	if _, out := do(t, client(), "GET", g.srv.URL+"/api/v1/setup", ""); out["email_codes"] != false {
		t.Fatalf("a server with no mail says codes can be sent: %v", out)
	}
	if code, out := g.askCode(t, "me@site.com"); code != http.StatusAccepted || out["ok"] != true {
		t.Fatalf("ask: %d %v", code, out)
	}
	var n int
	_ = g.ctl.DB.QueryRow(`SELECT count(*) FROM login_codes`).Scan(&n)
	if n != 0 {
		t.Fatal("a code was kept with no way to send it")
	}
}

func TestEmailCodeExpiresTriesOutAndIsReplaced(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	box := mailbox(g)

	g.askCode(t, "me@site.com")
	old := nextCode(t, box)
	g.advance(11 * time.Minute)
	if code, _ := g.verifyCode(t, client(), `{"email":"me@site.com","code":"`+old+`"}`); code != http.StatusUnauthorized {
		t.Fatalf("an expired code: %d", code)
	}

	g.advance(11 * time.Minute)
	g.askCode(t, "me@site.com")
	first := nextCode(t, box)
	g.advance(11 * time.Minute)
	g.askCode(t, "me@site.com")
	second := nextCode(t, box)
	if first == second {
		t.Skip("two random codes alike")
	}
	if code, _ := g.verifyCode(t, client(), `{"email":"me@site.com","code":"`+first+`"}`); code != http.StatusUnauthorized {
		t.Fatalf("a replaced code: %d", code)
	}
	// Five wrong tries end the code; the right one is no good after.
	wrong := "000000"
	if second == wrong {
		wrong = "000001"
	}
	// (the old code just tried was the first wrong one)
	for i := 0; i < 3; i++ {
		if code, _ := g.verifyCode(t, client(), `{"email":"me@site.com","code":"`+wrong+`"}`); code != http.StatusUnauthorized {
			t.Fatalf("wrong code %d: %d", i+1, code)
		}
	}
	if code, _ := g.verifyCode(t, client(), `{"email":"me@site.com","code":"`+second+`"}`); code != http.StatusOK {
		t.Fatalf("the right code after 4 wrong tries: %d", code)
	}

	g.advance(11 * time.Minute)
	g.askCode(t, "me@site.com")
	third := nextCode(t, box)
	if third == wrong {
		wrong = "000002"
	}
	for i := 0; i < 5; i++ {
		g.verifyCode(t, client(), `{"email":"me@site.com","code":"`+wrong+`"}`)
	}
	if code, _ := g.verifyCode(t, client(), `{"email":"me@site.com","code":"`+third+`"}`); code != http.StatusUnauthorized {
		t.Fatalf("the right code after 5 wrong tries: %d, want 401", code)
	}
}

func TestEmailCodeAsksAreLimited(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	box := mailbox(g)
	for i := 0; i < 5; i++ {
		if code, _ := g.askCode(t, "me@site.com"); code != http.StatusAccepted {
			t.Fatalf("ask %d: %d", i+1, code)
		}
	}
	if code, _ := g.askCode(t, "me@site.com"); code != http.StatusTooManyRequests {
		t.Fatalf("a sixth code for one inbox: %d, want 429", code)
	}
	// An address nobody has is limited the same.
	for i := 0; i < 5; i++ {
		g.askCode(t, "nobody@site.com")
	}
	if code, _ := g.askCode(t, "nobody@site.com"); code != http.StatusTooManyRequests {
		t.Fatalf("a sixth ask for an unknown address: %d, want 429", code)
	}
	_ = box
}

func TestEmailCodeStillAsksForTheSecondStep(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	box := mailbox(g)
	const pw = `"correct horse battery"`
	_, out := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/start", `{"password":`+pw+`}`, csrf, "1")
	secret := out["secret"].(string)
	now, _ := auth.TOTPCode(secret, g.now)
	if code, out := do(t, c, "POST", g.srv.URL+"/api/v1/account/2fa/enable", `{"password":`+pw+`,"code":"`+now+`"}`, csrf, "1"); code != http.StatusOK {
		t.Fatalf("enable: %d %v", code, out)
	}

	g.askCode(t, "me@site.com")
	mailed := nextCode(t, box)
	code, out := g.verifyCode(t, client(), `{"email":"me@site.com","code":"`+mailed+`"`+deviceBody+`}`)
	if code != http.StatusUnauthorized || out["needs_code"] != true || out["token"] != nil {
		t.Fatalf("the emailed code alone got in: %d %v", code, out)
	}
	if code, out := g.verifyCode(t, client(), `{"email":"me@site.com","code":"`+mailed+`","second_code":"000000"`+deviceBody+`}`); code != http.StatusUnauthorized || out["needs_code"] != true {
		t.Fatalf("a wrong second step: %d %v", code, out)
	}
	good, _ := auth.TOTPCode(secret, g.advance(time.Minute))
	code, out = g.verifyCode(t, client(), `{"email":"me@site.com","code":"`+mailed+`","second_code":"`+good+`"`+deviceBody+`}`)
	if code != http.StatusOK || out["token"] == nil {
		t.Fatalf("both steps: %d %v", code, out)
	}
}

func TestPasswordLoginCanMakeADevice(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	phone := client()
	code, out := do(t, phone, "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery"`+deviceBody+`}`)
	token, _ := out["token"].(string)
	if code != http.StatusOK || token == "" {
		t.Fatalf("login with a device: %d %v", code, out)
	}
	if cs := phone.Jar.Cookies(mustURL(g.srv.URL)); len(cs) != 0 {
		t.Fatalf("a cookie came with the device: %v", cs)
	}
	if code, _ := bearer(t, token, "GET", g.srv.URL+"/api/v1/me/devices"); code != http.StatusOK {
		t.Fatalf("devices with the token: %d", code)
	}
	// Two-step still asked for.
	if code, out := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"wrong password"`+deviceBody+`}`); code != http.StatusUnauthorized || out["token"] != nil {
		t.Fatalf("a wrong password made a device: %d %v", code, out)
	}
}

func TestDevicesAreRevoked(t *testing.T) {
	g := newRig(t)
	ctx := context.Background()
	owner := client()
	g.setup(t, owner)
	viewer, err := g.ctl.AddUser(ctx, sqlite.DefaultAccount, "viewer@site.com", "correct horse battery V", sqlite.RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	signIn := func(email, pw string) string {
		t.Helper()
		_, out := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"`+email+`","password":"`+pw+`"`+deviceBody+`}`)
		tok, _ := out["token"].(string)
		if tok == "" {
			t.Fatalf("no device for %s: %v", email, out)
		}
		return tok
	}
	ownerPhone := signIn("me@site.com", "correct horse battery")
	ownerTablet := signIn("me@site.com", "correct horse battery")
	viewerPhone := signIn("viewer@site.com", "correct horse battery V")
	me := g.srv.URL + "/api/v1/me"

	// A viewer's device is a viewer: it reads, it changes nothing, and it may
	// list and remove its own devices.
	if code, _ := bearer(t, viewerPhone, "GET", g.srv.URL+"/api/v1/sites/"+g.site+"/report"); code >= 400 {
		t.Fatalf("a viewer's device reads a report: %d", code)
	}
	if code, _ := do(t, http.DefaultClient, "PATCH", g.srv.URL+"/api/v1/sites/"+g.site, `{"name":"x"}`, "Authorization", "Bearer "+viewerPhone); code != http.StatusForbidden {
		t.Fatalf("a viewer's device changes a site: %d", code)
	}

	// Another person's device id is not found, and still there.
	_, out := bearer(t, viewerPhone, "GET", g.srv.URL+"/api/v1/me/devices")
	viewerDev := out["devices"].([]any)[0].(map[string]any)["id"].(string)
	if code, _ := bearer(t, ownerPhone, "DELETE", g.srv.URL+"/api/v1/me/devices/"+viewerDev); code != http.StatusNotFound {
		t.Fatalf("the owner removing the viewer's device: %d", code)
	}
	if code, _ := bearer(t, viewerPhone, "GET", me); code != http.StatusOK {
		t.Fatalf("the viewer's device after that: %d", code)
	}

	// DELETE ends a device at once; the other keeps working.
	_, out = bearer(t, ownerPhone, "GET", g.srv.URL+"/api/v1/me/devices")
	var tabletID string
	for _, d := range out["devices"].([]any) {
		if d.(map[string]any)["current"] != true {
			tabletID = d.(map[string]any)["id"].(string)
		}
	}
	if code, _ := bearer(t, ownerPhone, "DELETE", g.srv.URL+"/api/v1/me/devices/"+tabletID); code != http.StatusNoContent {
		t.Fatalf("remove: %d", code)
	}
	if code, _ := bearer(t, ownerTablet, "GET", me); code != http.StatusUnauthorized {
		t.Fatalf("a removed device still works: %d", code)
	}
	if code, _ := bearer(t, ownerPhone, "GET", me); code != http.StatusOK {
		t.Fatalf("the other device: %d", code)
	}

	// Removing a person ends their devices.
	if err := g.ctl.RemoveUser(ctx, sqlite.DefaultAccount, viewer.ID); err != nil {
		t.Fatal(err)
	}
	if code, _ := bearer(t, viewerPhone, "GET", me); code != http.StatusUnauthorized {
		t.Fatalf("a removed person's device: %d", code)
	}

	// A new password ends them too.
	if code, out := do(t, owner, "POST", g.srv.URL+"/api/v1/account/password", `{"current":"correct horse battery","password":"another long password"}`, csrf, "1"); code != http.StatusNoContent {
		t.Fatalf("password: %d %v", code, out)
	}
	if code, _ := bearer(t, ownerPhone, "GET", me); code != http.StatusUnauthorized {
		t.Fatalf("a device after a password change: %d", code)
	}
}

func TestResetPersonPasswordEndsDevices(t *testing.T) {
	g := newRig(t)
	ctx := context.Background()
	g.setup(t, client())
	p, err := g.ctl.AddUser(ctx, sqlite.DefaultAccount, "viewer@site.com", "correct horse battery V", sqlite.RoleViewer)
	if err != nil {
		t.Fatal(err)
	}
	_, out := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"viewer@site.com","password":"correct horse battery V"`+deviceBody+`}`)
	tok, _ := out["token"].(string)
	if code, _ := bearer(t, tok, "GET", g.srv.URL+"/api/v1/me"); code != http.StatusOK {
		t.Fatalf("before: %d", code)
	}
	if err := g.ctl.ResetPersonPassword(ctx, sqlite.DefaultAccount, p.ID, "a fresh long password"); err != nil {
		t.Fatal(err)
	}
	if code, _ := bearer(t, tok, "GET", g.srv.URL+"/api/v1/me"); code != http.StatusUnauthorized {
		t.Fatalf("after a reset: %d", code)
	}
}

func TestAnAPIKeyHasNoDevices(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	key, _, err := g.ctl.CreateAPIKey(context.Background(), sqlite.DefaultAccount, "k")
	if err != nil {
		t.Fatal(err)
	}
	if code, _ := bearer(t, key, "GET", g.srv.URL+"/api/v1/me/devices"); code != http.StatusForbidden {
		t.Fatalf("a key lists devices: %d", code)
	}
	if code, _ := bearer(t, key, "DELETE", g.srv.URL+"/api/v1/me/devices/x"); code != http.StatusForbidden {
		t.Fatalf("a key removes a device: %d", code)
	}
	if code, _ := bearer(t, sqlite.DeviceTokenPrefix+"notatoken", "GET", g.srv.URL+"/api/v1/me/devices"); code != http.StatusUnauthorized {
		t.Fatalf("a made-up device token: %d", code)
	}
}

func mustURL(s string) *url.URL {
	u, err := url.Parse(s)
	if err != nil {
		panic(err)
	}
	return u
}

func TestLogoutWithADeviceTokenRemovesIt(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	login := func() string {
		_, out := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery"`+deviceBody+`}`)
		tok, _ := out["token"].(string)
		return tok
	}
	a, b := login(), login()
	if code, _ := do(t, http.DefaultClient, "POST", g.srv.URL+"/api/v1/logout", `{}`, "Authorization", "Bearer "+a); code != http.StatusNoContent {
		t.Fatalf("logout: %d", code)
	}
	if code, _ := bearer(t, a, "GET", g.srv.URL+"/api/v1/me"); code != http.StatusUnauthorized {
		t.Fatalf("the device after logout: %d", code)
	}
	if code, _ := bearer(t, b, "GET", g.srv.URL+"/api/v1/me"); code != http.StatusOK {
		t.Fatalf("the other device: %d", code)
	}
}

func TestPasswordChangeFromADeviceKeepsThatDevice(t *testing.T) {
	g := newRig(t)
	web := client()
	g.setup(t, web)
	login := func(name string) string {
		_, out := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery","device":{"name":"`+name+`","platform":"ios"}}`)
		tok, _ := out["token"].(string)
		return tok
	}
	a, b := login("A"), login("B")
	phone := client()
	code, _ := do(t, phone, "POST", g.srv.URL+"/api/v1/account/password", `{"current":"correct horse battery","password":"another long password"}`, "Authorization", "Bearer "+a)
	if code != http.StatusNoContent {
		t.Fatalf("password from a device: %d", code)
	}
	if cs := phone.Jar.Cookies(mustURL(g.srv.URL)); len(cs) != 0 {
		t.Fatalf("a cookie came with it: %v", cs)
	}
	if code, _ := bearer(t, a, "GET", g.srv.URL+"/api/v1/me"); code != http.StatusOK {
		t.Fatalf("the calling device: %d", code)
	}
	if code, _ := bearer(t, b, "GET", g.srv.URL+"/api/v1/me"); code != http.StatusUnauthorized {
		t.Fatalf("the other device: %d", code)
	}
	if code, _ := do(t, web, "GET", g.srv.URL+"/api/v1/me", ""); code != http.StatusUnauthorized {
		t.Fatalf("the browser session: %d", code)
	}
}

func TestDeviceNamesAreCleaned(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	long := strings.Repeat("x", 100)
	_, out := do(t, client(), "POST", g.srv.URL+"/api/v1/login", `{"email":"me@site.com","password":"correct horse battery","device":{"name":"Ph\u0000o\nne `+long+`"}}`)
	name := out["device"].(map[string]any)["name"].(string)
	if len([]rune(name)) != sqlite.MaxDeviceName || strings.ContainsAny(name, "\x00\n") || !strings.HasPrefix(name, "Phone x") {
		t.Fatalf("name %q", name)
	}
}

func TestEmailCodeMailSaysWhyAndFromWhere(t *testing.T) {
	g := newRig(t)
	g.setup(t, client())
	g.api.Locate = func(string) string { return "Berlin, DE" }
	box := mailbox(g)
	g.askCodeBody(t, `{"email":"me@site.com","device":{"name":"Pixel 8","platform":"android"}}`)
	select {
	case r := <-box:
		if !strings.HasPrefix(r.Subject, "Your trckable app sign-in code: ") {
			t.Fatalf("subject: %q", r.Subject)
		}
		m := codeInSubject.FindStringSubmatch(r.Subject)
		for _, want := range []string{m[1] + m[2], "cid:" + mailkit.LogoCID, "Sign in to the trckable mobile app", "Pixel 8 (Android)", "Berlin, DE", "trckable.com"} {
			if !strings.Contains(r.HTML, want) {
				t.Errorf("the HTML lacks %q", want)
			}
		}
		for _, want := range []string{m[0], "Pixel 8 (Android)", "Berlin, DE", "nobody can sign in without the code"} {
			if !strings.Contains(r.Text, want) {
				t.Errorf("the text lacks %q", want)
			}
		}
		if len(r.Attachments) != 1 || r.Attachments[0].Inline != mailkit.LogoCID {
			t.Errorf("the logo is not attached inline: %v", r.Attachments)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("no email was sent")
	}
	g.askCodeBody(t, `{"email":"me@site.com"}`)
	r := <-box
	if !strings.Contains(r.HTML, "the trckable dashboard") || !strings.Contains(r.Text, "a web browser") {
		t.Errorf("a code asked without a device should name the browser: %q", r.Text)
	}
}

func (g *rig) askCodeBody(t *testing.T, body string) {
	t.Helper()
	if code, out := do(t, client(), "POST", g.srv.URL+"/api/v1/login/code", body); code != http.StatusAccepted {
		t.Fatalf("ask: %d %v", code, out)
	}
}
