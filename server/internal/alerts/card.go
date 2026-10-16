package alerts

import (
	"html"
	"regexp"
	"strings"
)

// Card is an alert dressed as an email: one big line, a few rows, one button
// and a footer that stops it. Tables and inline styles only, the way mail
// clients want it; light by default, dark where the client asks for it.
// Everything in it is escaped when it is drawn, so a site's name or a page's
// path can carry anything.
type Card struct {
	Site      string      // the site, muted, under the logo; a link to Link when there is one
	Eyebrow   string      // the small line above the number
	Unit      string      // the word under the number ("pageviews")
	Plain     string      // the plain-text twin, when the message is not it
	Live      bool        // a green dot before the eyebrow
	Big       string      // the number or the headline
	Strong    string      // the first words of the line under it, in colour ("1.9×")
	Sub       string      // ... and the rest of that line
	Text      string      // a paragraph, for messages that have no number
	Rows      [][2]string // label and value, one line each
	CTA, Link string      // the one button; none without a link
	Note      string      // what the footer says this email is
	Ask       string      // an address that opens the dashboard on this event; left out when empty
}

const (
	cardNoteDefault = "Sent by trckable."
	cardStop        = "Stop these alerts"
	cardSettings    = "Alert settings"
	cardAsk         = "Open in dashboard"
	rowValueRunes   = 30
)

// Short keeps the end of a long path or name, since the end is the part that
// tells pages apart: "…kualifikimi-i-mesuesve-2025".
func Short(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return "…" + string(r[len(r)-(max-1):])
}

func esc(s string) string { return html.EscapeString(s) }

// A plain http(s) address is the only kind of link the button and footer take.
func safeLink(u string) string {
	if strings.HasPrefix(u, "https://") || strings.HasPrefix(u, "http://") {
		return u
	}
	return ""
}

// cardCSS gives dark where the client honours it. Light is every element's own
// inline style, so a client that strips <style> still shows a light email.
const cardCSS = `:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (prefers-color-scheme: dark){
.bg{background:#0b0d10 !important}
.tx{color:#eceee9 !important}
.mu{color:#8b9097 !important}
.rw{background:#14171c !important}
.ln{border-top-color:#22262d !important}
.st{color:#2fbf71 !important}
.bt{background:#c6ff3a !important;color:#0b0d10 !important}
.bt a{color:#0b0d10 !important}
.mu a{color:#8b9097 !important}
}
a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important}
u + .bg a{color:inherit}`

// pageOpen starts every branded email: head, light page, one centred column.
// extraCSS rides in the style block after the shared dark-mode rules.
func pageOpen(extraCSS string) string {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>` + cardCSS + extraCSS + `</style></head>` +
		`<body class="bg" style="margin:0;padding:0;background:#ffffff"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:#ffffff"><tr><td align="center" style="padding:24px 16px">` +
		`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%"><tr><td class="tx" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#16181c">`
}

const pageClose = `</td></tr></table></td></tr></table></body></html>`

// quiet keeps Gmail and Apple Mail from turning a domain or a date into a blue
// link of their own: a zero-width space after the dot of a domain and after the
// day of a date breaks what their detectors look for, and reads the same.
var (
	domainDot = regexp.MustCompile(`([A-Za-z0-9])\.([A-Za-z])`)
	dayMonth  = regexp.MustCompile(`(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)`)
)

func quiet(s string) string {
	s = domainDot.ReplaceAllString(s, "$1.\u200b$2")
	return dayMonth.ReplaceAllString(s, "$1\u200b $2")
}

// txt is text for a text node: escaped and kept from auto-linking. Attributes
// take esc, since a link must stay exactly as it is.
func txt(s string) string { return esc(quiet(s)) }

// HTML draws the card. stop and settings are the footer's two links, left out
// when empty.
func (c Card) HTML(stop, settings string) string {
	var b strings.Builder
	b.WriteString(pageOpen(""))
	b.WriteString(brandHeader())
	if c.Site != "" {
		site := txt(c.Site)
		if l := safeLink(c.Link); l != "" {
			site = `<a href="` + esc(l) + `" style="color:#6b7078;text-decoration:none">` + site + `</a>`
		}
		b.WriteString(`<div class="mu" style="font-size:15px;line-height:1.4;color:#6b7078;margin:0 0 18px">` + site + `</div>`)
	}
	if c.Eyebrow != "" {
		dot := ""
		if c.Live {
			dot = `<span style="color:#2fbf71">&#9679;</span>&nbsp; `
		}
		b.WriteString(`<div class="mu" style="font-size:14px;font-weight:600;color:#6b7078">` + dot + txt(c.Eyebrow) + `</div>`)
	}
	size := "56px"
	if c.Text != "" {
		size = "26px"
	}
	if c.Big != "" {
		b.WriteString(`<div class="tx" style="font-size:` + size + `;font-weight:800;letter-spacing:-.02em;line-height:1.1;margin:6px 0 0;color:#16181c">` + txt(c.Big) + `</div>`)
	}
	if c.Unit != "" {
		b.WriteString(`<div class="mu" style="font-size:20px;font-weight:500;margin:2px 0 0;color:#6b7078">` + txt(c.Unit) + `</div>`)
	}
	if c.Strong != "" || c.Sub != "" {
		b.WriteString(`<div class="tx" style="font-size:16px;margin:10px 0 0;color:#16181c">`)
		if c.Strong != "" {
			b.WriteString(`<b class="st" style="color:#177a44">` + txt(c.Strong) + `</b> `)
		}
		b.WriteString(txt(c.Sub) + `</div>`)
	}
	if c.Text != "" {
		b.WriteString(`<div class="tx" style="margin:12px 0 0;font-size:16px;color:#16181c">` + strings.ReplaceAll(txt(c.Text), "\n", "<br>") + `</div>`)
	}
	b.WriteString(`<div style="height:24px;line-height:24px">&nbsp;</div>`)

	if len(c.Rows) > 0 {
		b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="rw" style="background:#f4f4f0;border-radius:12px">`)
		for i, r := range c.Rows {
			line := ""
			if i > 0 {
				line = "border-top:1px solid #e4e4de;"
			}
			b.WriteString(`<tr><td class="mu ln" style="` + line + `padding:11px 14px;font-size:14px;color:#6b7078;white-space:nowrap">` + txt(r[0]) + `</td>`)
			b.WriteString(`<td class="tx ln" align="right" style="` + line + `padding:11px 14px;font-size:14px;font-weight:500;color:#16181c">` + txt(Short(r[1], rowValueRunes)) + `</td></tr>`)
		}
		b.WriteString(`</table><div style="height:24px;line-height:24px">&nbsp;</div>`)
	}

	if l := safeLink(c.Link); l != "" && c.CTA != "" {
		b.WriteString(`<table role="presentation" cellpadding="0" cellspacing="0" align="left"><tr><td align="center" bgcolor="#c6ff3a" class="bt" style="background:#c6ff3a;border-radius:10px"><a href="` + esc(l) + `" style="display:block;padding:14px 28px;font-size:16px;font-weight:700;color:#0b0d10;text-decoration:none">` + txt(c.CTA) + `</a></td></tr></table>`)
		b.WriteString(`<div style="clear:both;height:36px;line-height:36px">&nbsp;</div>`)
	}

	note := c.Note
	if note == "" {
		note = cardNoteDefault
	}
	b.WriteString(`<div class="mu" style="font-size:13px;line-height:1.7;color:#6b7078">` + txt(note))
	var links []string
	link := func(u, label string) {
		if l := safeLink(u); l != "" {
			links = append(links, `<a href="`+esc(l)+`" style="color:#6b7078;text-decoration:underline">`+label+`</a>`)
		}
	}
	link(c.Ask, cardAsk)
	link(stop, cardStop)
	link(settings, cardSettings)
	if len(links) > 0 {
		b.WriteString(`<br>` + strings.Join(links, " &nbsp;·&nbsp; "))
	}
	b.WriteString(`</div><div class="mu" style="font-size:13px;line-height:1.6;color:#6b7078;margin:10px 0 0">` + brandFoot + `</div>`)
	b.WriteString(pageClose)
	return b.String()
}

// cardFor is the card of an alert that brought none: its title and message,
// under the site's name.
func cardFor(e Event) Card {
	return Card{Site: header(e.Domain), Big: header(e.Title), Text: e.Message}
}
