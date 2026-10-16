// Package mailkit draws trckable's emails from a few blocks: a frame (the
// logo row, the inbox preview line and the footer) around a hero, stat
// tiles, bars, callouts, rows, quotes, badges and one button. Every block
// draws itself twice, as HTML and as plain text, so the two parts of an email
// always say the same.
//
// The HTML is what mail clients want: tables and inline styles, 600 px wide,
// light by default with dark rules for the clients that follow
// prefers-color-scheme (and Outlook.com's own attributes), a bulletproof
// button for Outlook on Windows, and no external resource: pictures travel
// inline under a content id. Everything that came from outside is escaped
// when it is drawn.
package mailkit

import (
	"html"
	"regexp"
	"strconv"
	"strings"
)

// Email is one email: its frame and the blocks inside it, top to bottom.
type Email struct {
	Lang      string // the page's language; "en" when empty
	Title     string // the page's title, which some clients show
	Preheader string // the line the inbox shows after the subject
	Brand     Brand
	Blocks    []Block
	Foot      Foot
}

// Brand is whose email it is. The zero value is trckable's own: the ghost,
// the name and the lime accent.
type Brand struct {
	Name     string // a client's name, drawn when there is no logo
	Logo     []byte // a client's logo (PNG, JPEG or GIF), drawn instead of the ghost
	LogoType string
	Accent   string // #rrggbb for the button and the highlights; lime when empty
	Hide     bool   // leave trckable's name out of the footer
}

// Foot is the small print: what this email is and the links that change or
// stop it.
type Foot struct {
	Note      string // "You get this when ..."; "Sent by trckable." when empty
	Links     []Link
	StopLabel string // what a sender calls the stop link it adds ("Stop receiving this report")
}

// Link is one footer link. A link that is not plain http(s) is left out.
type Link struct{ Label, URL string }

// Block is one part of an email. The kit's blocks are the only ones.
type Block interface {
	html(p *page)
	text() string
	gap() int // the space above it, in pixels
}

// pictured is a block that shows pictures, which then travel with the email.
type pictured interface{ pictures() []Picture }

// NoteDefault is what the footer says when an email says nothing else.
const NoteDefault = "Sent by trckable."

const (
	brandSite = "trckable.com"
	brandURL  = "https://trckable.com"
	font      = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
	ink       = "#14181d"
	muted     = "#5b6573"
	line      = "#e1e6ec"
	outer     = "#eef1f4" // the page around the card
	card      = "#fbfcfd"
)

// page is the HTML being written, and the colours of its brand.
type page struct {
	strings.Builder
	th theme
}

// theme is a brand's accent: the button, the highlighted words and bars.
type theme struct {
	btn, btnInk string // the button and its text
	accent      string // highlighted words on a light page
	acClass     string // the class that turns them lime on a dark page; empty for a client's colour
	hot         string // the highlighted bars on a light page
	hotClass    string
}

func (b Brand) theme() theme {
	if c := b.Accent; isHex(c) {
		return theme{btn: c, btnInk: Ink(c), accent: c, hot: c}
	}
	return theme{btn: Lime, btnInk: Dark, accent: "#4f7d00", acClass: "ac", hot: "#9bd400", hotClass: "hot"}
}

// Lime and Dark are trckable's two colours.
const (
	Lime = "#c6ff3a"
	Dark = "#0b0d10"
)

func isHex(c string) bool {
	if len(c) != 7 || c[0] != '#' {
		return false
	}
	for _, r := range c[1:] {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') && (r < 'A' || r > 'F') {
			return false
		}
	}
	return true
}

// Ink is the text colour that reads on a colour: black or white.
func Ink(hex string) string {
	if !isHex(hex) {
		return "#ffffff"
	}
	var c [3]float64
	for i := range c {
		v := 0
		for _, ch := range hex[1+2*i : 3+2*i] {
			v *= 16
			switch {
			case ch >= '0' && ch <= '9':
				v += int(ch - '0')
			case ch >= 'a' && ch <= 'f':
				v += int(ch-'a') + 10
			case ch >= 'A' && ch <= 'F':
				v += int(ch-'A') + 10
			}
		}
		c[i] = float64(v) / 255
	}
	if 0.2126*c[0]+0.7152*c[1]+0.0722*c[2] > 0.5 {
		return "#111111"
	}
	return "#ffffff"
}

// Short keeps the end of a long path or name, since the end is the part that
// tells pages apart: "…kualifikimi-i-mesuesve-2025".
func Short(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return "…" + string(r[len(r)-(max-1):])
}

// Cut keeps the start of a long text, ending in an ellipsis.
func Cut(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max-1]) + "…"
}

func esc(s string) string { return html.EscapeString(s) }

// safe is a link the kit draws: plain http(s) only.
func safe(u string) string {
	if strings.HasPrefix(u, "https://") || strings.HasPrefix(u, "http://") {
		return u
	}
	return ""
}

// Gmail and Apple Mail turn a domain or a date into a blue link of their own.
// A zero-width space (as the entity, never the bare character) after the dot
// of a domain and after the day of a date breaks what their detectors look
// for, and reads the same.
var (
	domainDot = regexp.MustCompile(`([A-Za-z0-9])\.([A-Za-z])`)
	dayMonth  = regexp.MustCompile(`(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)`)
)

// ZWSP is the zero-width space as the kit writes it.
const ZWSP = "&#8203;"

// txt is text for a text node: escaped, kept from auto-linking, and its line
// breaks kept. Attributes take esc, since a link must stay exactly as it is.
func txt(s string) string {
	s = domainDot.ReplaceAllString(esc(s), "$1."+ZWSP+"$2")
	s = dayMonth.ReplaceAllString(s, "$1"+ZWSP+" $2")
	return strings.ReplaceAll(s, "\n", "<br>")
}

// Images are the pictures the HTML shows, each once: the logo and what the
// blocks show. They travel inline, under their content id.
func (e Email) Images() []Picture {
	var out []Picture
	seen := map[string]bool{}
	add := func(p Picture) {
		if len(p.Data) > 0 && !seen[p.CID] {
			seen[p.CID] = true
			out = append(out, p)
		}
	}
	add(e.logo())
	for _, b := range e.Blocks {
		if p, ok := b.(pictured); ok {
			for _, pic := range p.pictures() {
				add(pic)
			}
		}
	}
	return out
}

// logo is the picture of the header: a client's logo, none for a client with
// only a name, else the ghost.
func (e Email) logo() Picture {
	switch {
	case len(e.Brand.Logo) > 0:
		return Picture{CID: LogoCID, Name: "logo", Type: e.Brand.LogoType, Data: e.Brand.Logo}
	case e.Brand.Name != "":
		return Picture{}
	}
	return Logo
}

// HTML draws the email.
func (e Email) HTML() string {
	p := &page{th: e.Brand.theme()}
	lang := e.Lang
	if lang == "" {
		lang = "en"
	}
	p.WriteString(`<!doctype html><html lang="` + esc(lang) + `" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8">` +
		`<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">` +
		`<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">` +
		`<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>` + esc(e.Title) + `</title>` +
		`<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>table,td,div,p,a,span,b{font-family:Arial,Helvetica,sans-serif !important}</style><![endif]-->` +
		`<style>` + css + `</style></head>`)
	p.WriteString(`<body id="body" class="bg" style="margin:0;padding:0;word-spacing:normal;background:` + outer + `;color:` + ink + `">`)
	if e.Preheader != "" {
		p.WriteString(`<div style="display:none;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;opacity:0;color:` + outer + `">` + esc(e.Preheader) + strings.Repeat("&#8199;&#847;", 60) + `</div>`)
	}
	p.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" bgcolor="` + outer + `" style="width:100%;background:` + outer + `"><tr><td align="center" class="gut" style="padding:28px 12px">`)
	p.WriteString(`<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->`)
	p.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cd0" bgcolor="` + card + `" style="width:100%;max-width:600px;background:` + card + `;border:1px solid ` + line + `;border-radius:16px;border-collapse:separate">`)
	p.WriteString(`<tr><td class="top" style="padding:28px 36px 0">` + e.header() + `</td></tr>`)
	first := true
	for _, b := range e.Blocks {
		var inner page
		inner.th = p.th
		b.html(&inner)
		if inner.Len() == 0 {
			continue
		}
		gap := b.gap()
		if first {
			gap, first = 28, false
		}
		p.row(gap, inner.String())
	}
	p.WriteString(`<tr><td style="height:32px;font-size:0;line-height:0">&nbsp;</td></tr>`)
	p.WriteString(`<tr><td class="mu ln pad" style="padding:20px 36px 26px;border-top:1px solid ` + line + `;` + font + `;font-size:13px;line-height:20px;color:` + muted + `">` + e.footer() + `</td></tr>`)
	p.WriteString(`</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`)
	return p.String()
}

// row is one block's line of the column, with its space above as padding,
// which every client keeps (Outlook drops margins).
func (p *page) row(gap int, inner string) {
	p.WriteString(`<tr><td class="tx pad" style="padding:` + px(gap) + ` 36px 0;` + font + `;font-size:15px;line-height:1.5;color:` + ink + `">` + inner + `</td></tr>`)
}

func (e Email) header() string {
	switch {
	case len(e.Brand.Logo) > 0:
		return `<img src="cid:` + LogoCID + `" alt="` + esc(e.Brand.Name) + `" height="32" style="display:block;height:32px;width:auto;max-width:200px;border:0">`
	case e.Brand.Name != "":
		return `<div style="` + font + `;font-size:20px;font-weight:700;letter-spacing:-.01em;color:` + esc(e.Brand.theme().accent) + `">` + txt(e.Brand.Name) + `</div>`
	}
	return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
		`<td valign="middle" style="padding:0 10px 0 0"><img src="cid:` + LogoCID + `" alt="" width="28" height="28" style="display:block;width:28px;height:28px;border:0"></td>` +
		`<td valign="middle" class="tx" style="` + font + `;font-size:20px;font-weight:700;letter-spacing:-.01em;color:` + ink + `">trckable</td></tr></table>`
}

func (e Email) footer() string {
	note := e.Foot.Note
	if note == "" {
		note = NoteDefault
	}
	inner := txt(note)
	var links []string
	for _, l := range e.Foot.Links {
		if u := safe(l.URL); u != "" && l.Label != "" {
			links = append(links, `<a href="`+esc(u)+`" class="mu" style="color:`+muted+`;text-decoration:underline">`+esc(l.Label)+`</a>`)
		}
	}
	if len(links) > 0 {
		inner += `<br>` + strings.Join(links, " &nbsp;&middot;&nbsp; ")
	}
	if !e.Brand.Hide {
		inner += `<br><a href="` + brandURL + `" class="mu" style="color:` + muted + `;text-decoration:underline">` + brandSite + `</a>`
	}
	return inner
}

// Text is the plain-text twin: each block's words, then the footer's.
func (e Email) Text() string {
	var parts []string
	for _, b := range e.Blocks {
		if t := strings.TrimSpace(b.text()); t != "" {
			parts = append(parts, t)
		}
	}
	note := e.Foot.Note
	if note == "" {
		note = NoteDefault
	}
	foot := []string{"-- ", note}
	for _, l := range e.Foot.Links {
		if u := safe(l.URL); u != "" && l.Label != "" {
			foot = append(foot, l.Label+": "+u)
		}
	}
	if !e.Brand.Hide {
		foot = append(foot, brandSite)
	}
	return strings.Join(parts, "\n\n") + "\n\n" + strings.Join(foot, "\n")
}

func px(n int) string { return strconv.Itoa(n) + "px" }
