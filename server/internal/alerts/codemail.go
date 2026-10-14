package alerts

import (
	"fmt"
	"strings"
	"time"
)

// LogoCID is the content id the inline logo travels under; the weekly report
// uses the same one.
const LogoCID = "logo@report"

// brandHeader is the line at the top of the branded emails: the ghost and the
// name. A client that blocks images still shows the name.
func brandHeader() string {
	return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px"><tr>` +
		`<td valign="middle" style="padding:0 10px 0 0"><img src="cid:` + LogoCID + `" alt="" width="28" height="28" style="display:block;width:28px;height:28px;border:0"></td>` +
		`<td valign="middle" class="tx" style="font-size:20px;font-weight:700;letter-spacing:-.01em;color:#16181c">trckable</td></tr></table>`
}

const brandFoot = `<a href="https://trckable.com" style="color:inherit;text-decoration:underline">trckable.com</a>`

// CodeMail is the sign-in code email: why it was sent, the code, and where the
// request came from, so a request nobody made stands out.
type CodeMail struct {
	Code      string // "331 983"
	Source    string // "the trckable mobile app", "trckable on the web"
	Requester string // "Pixel 8 (Android)", "a web browser"
	Place     string // "Berlin, Germany", empty when unknown
	At        time.Time
}

const codeCSS = `
@media (prefers-color-scheme: dark){
.cb{background:#14171c !important;border-color:#22262d !important}
.cd{color:#c6ff3a !important}
}`

func (c CodeMail) from() string {
	parts := []string{c.Requester, c.At.UTC().Format("2 Jan 2006, 15:04 MST")}
	if c.Place != "" {
		parts = append(parts, c.Place)
	}
	return strings.Join(parts, " · ")
}

// Text is the plain-text twin.
func (c CodeMail) Text() string {
	return "Sign in to " + c.Source + "\n\n" +
		"Someone asked to sign in to " + c.Source + " with this email address.\n\n" +
		"Your code: " + c.Code + "\n\n" +
		"Enter it in the app. It works for 10 minutes.\n\n" +
		"Requested from: " + c.from() + "\n\n" +
		"Didn't ask for it? Ignore this email; nobody can sign in without the code.\n\n-- \ntrckable.com"
}

// HTML is the branded page: tables and inline styles, light by default, dark
// where the client asks for it.
func (c CodeMail) HTML() string {
	var b strings.Builder
	b.WriteString(pageOpen(codeCSS))
	b.WriteString(brandHeader())
	b.WriteString(`<div class="tx" style="font-size:24px;font-weight:700;letter-spacing:-.02em;line-height:1.2;margin:0 0 10px;color:#16181c">Sign in to ` + esc(c.Source) + `</div>`)
	b.WriteString(`<div class="tx" style="margin:0 0 20px;color:#16181c">Someone asked to sign in to ` + esc(c.Source) + ` with this email address.</div>`)
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="cb" style="background:#f4f4f0;border:1px solid #e4e4de;border-radius:14px"><tr><td align="center" style="padding:22px 12px">` +
		`<span class="cd tx" style="font-family:Menlo,Consolas,'Courier New',monospace;font-size:38px;font-weight:700;letter-spacing:.18em;line-height:1;color:#16181c;white-space:nowrap">` + esc(strings.ReplaceAll(c.Code, " ", "")) + `</span>` +
		`</td></tr></table>`)
	b.WriteString(`<div class="tx" style="margin:18px 0 0;color:#16181c">Enter it in the app. It works for 10 minutes.</div>`)
	b.WriteString(`<div class="mu" style="margin:18px 0 0;font-size:13px;color:#6b7078"><b>Requested from</b><br>` + esc(c.from()) + `</div>`)
	b.WriteString(`<div class="mu" style="margin:14px 0 0;font-size:13px;color:#6b7078">Didn&#39;t ask for it? Ignore this email; nobody can sign in without the code.</div>`)
	b.WriteString(`<div class="ln mu" style="border-top:1px solid #e4e4de;margin:24px 0 0;padding:14px 0 0;font-size:12px;color:#6b7078">` + brandFoot + `</div>`)
	b.WriteString(pageClose)
	return b.String()
}

// Ago is a span in words a person says: "35 minutes", "6 hours", "3 days".
func Ago(d time.Duration) string {
	n, unit := int(d.Minutes()), "minute"
	switch {
	case d >= 48*time.Hour:
		n, unit = int(d.Hours()/24), "day"
	case d >= time.Hour:
		n, unit = int(d.Hours()), "hour"
	}
	if n < 1 {
		n = 1
	}
	if n == 1 {
		return "1 " + unit
	}
	return fmt.Sprintf("%d %ss", n, unit)
}
