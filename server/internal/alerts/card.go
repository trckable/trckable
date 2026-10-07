package alerts

import (
	"html"
	"strings"
)

// Card is an alert dressed as an email: one big line, a few rows, one button
// and a footer that stops it. Tables and inline styles only, the way mail
// clients want it; light by default, dark where the client asks for it.
// Everything in it is escaped when it is drawn, so a site's name or a page's
// path can carry anything.
type Card struct {
	Eyebrow   string      // the small line above the number
	Live      bool        // a green dot before the eyebrow
	Big       string      // the number or the headline
	Strong    string      // the first words of the line under it, in colour ("1.9×")
	Sub       string      // ... and the rest of that line
	Text      string      // a paragraph, for messages that have no number
	Rows      [][2]string // label and value, one line each
	CTA, Link string      // the one button; none without a link
	Note      string      // what the footer says this email is
}

const (
	cardNoteDefault = "Sent by trckable."
	cardStop        = "Stop these alerts"
	cardSettings    = "Alert settings"
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
}`

// HTML draws the card. stop and settings are the footer's two links, left out
// when empty.
func (c Card) HTML(stop, settings string) string {
	var b strings.Builder
	b.WriteString(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>` + cardCSS + `</style></head>`)
	b.WriteString(`<body class="bg" style="margin:0;padding:0;background:#ffffff"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:#ffffff"><tr><td align="center" style="padding:24px 16px">`)
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%"><tr><td class="tx" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#16181c">`)

	if c.Eyebrow != "" {
		dot := ""
		if c.Live {
			dot = `<span style="color:#2fbf71">&#9679;</span>&nbsp; `
		}
		b.WriteString(`<div class="mu" style="font-family:Menlo,Consolas,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b7078">` + dot + esc(c.Eyebrow) + `</div>`)
	}
	size := "44px"
	if c.Text != "" {
		size = "24px"
	}
	if c.Big != "" {
		b.WriteString(`<div class="tx" style="font-size:` + size + `;font-weight:700;letter-spacing:-.02em;line-height:1.1;margin:6px 0 0;color:#16181c">` + esc(c.Big) + `</div>`)
	}
	if c.Strong != "" || c.Sub != "" {
		b.WriteString(`<div class="tx" style="font-size:15px;margin:4px 0 0;color:#16181c">`)
		if c.Strong != "" {
			b.WriteString(`<b class="st" style="color:#177a44">` + esc(c.Strong) + `</b> `)
		}
		b.WriteString(esc(c.Sub) + `</div>`)
	}
	if c.Text != "" {
		b.WriteString(`<div class="tx" style="margin:12px 0 0;color:#16181c">` + strings.ReplaceAll(esc(c.Text), "\n", "<br>") + `</div>`)
	}
	b.WriteString(`<div style="height:18px;line-height:18px">&nbsp;</div>`)

	if len(c.Rows) > 0 {
		b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="rw" style="background:#f4f4f0;border-radius:12px">`)
		for i, r := range c.Rows {
			line := ""
			if i > 0 {
				line = "border-top:1px solid #e4e4de;"
			}
			b.WriteString(`<tr><td class="mu ln" style="` + line + `padding:11px 14px;font-size:14px;color:#6b7078;white-space:nowrap">` + esc(r[0]) + `</td>`)
			b.WriteString(`<td class="tx ln" align="right" style="` + line + `padding:11px 14px;font-size:14px;font-weight:500;color:#16181c">` + esc(Short(r[1], rowValueRunes)) + `</td></tr>`)
		}
		b.WriteString(`</table><div style="height:20px;line-height:20px">&nbsp;</div>`)
	}

	if l := safeLink(c.Link); l != "" && c.CTA != "" {
		b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" class="bt" style="background:#16181c;border-radius:10px"><a href="` + esc(l) + `" style="display:block;padding:13px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">` + esc(c.CTA) + `</a></td></tr></table>`)
		b.WriteString(`<div style="height:22px;line-height:22px">&nbsp;</div>`)
	}

	note := c.Note
	if note == "" {
		note = cardNoteDefault
	}
	b.WriteString(`<div class="mu" style="font-size:12px;line-height:1.6;color:#6b7078">` + esc(note))
	var links []string
	if l := safeLink(stop); l != "" {
		links = append(links, `<a href="`+esc(l)+`" style="color:inherit">`+cardStop+`</a>`)
	}
	if l := safeLink(settings); l != "" {
		links = append(links, `<a href="`+esc(l)+`" style="color:inherit">`+cardSettings+`</a>`)
	}
	if len(links) > 0 {
		b.WriteString(`<br>` + strings.Join(links, " · "))
	}
	b.WriteString(`</div></td></tr></table></td></tr></table></body></html>`)
	return b.String()
}

// cardFor is the card of an alert that brought none: its title and message,
// under the site's name.
func cardFor(e Event) Card {
	return Card{Eyebrow: header(e.Domain), Big: header(e.Title), Text: e.Message}
}
