package reports

import (
	_ "embed"
	"fmt"
	"strings"
)

// Logo is trckable's ghost as a small PNG: mail clients cannot draw the
// dashboard's SVG. It travels inline under LogoCID.
//
//go:embed logo.png
var Logo []byte

// Weekly is what the weekly email says besides the report's own numbers
// (Data: the tiles and the two lists). The words are already in their
// sentences, as the plain-text twin has them.
type Weekly struct {
	Facts   []string // AI, goal and revenue lines
	Moments []string // the busiest moment and the findings, new referrers among them
	Link    string   // the dashboard on that week; the button is left out without it
}

// ellipsize cuts s to n characters, ending in an ellipsis, so a long path
// never stretches the email.
func ellipsize(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}

// The weekly email's colours, as classes: the inline values are the light
// ones every client reads, the style block turns them over for clients that
// follow prefers-color-scheme (Apple Mail, Gmail's apps, Outlook for Mac).
const weeklyStyle = `<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (prefers-color-scheme:dark){
.tk-bg{background:#0b0d10!important}
.tk-card{background:#14171c!important}
.tk-ink{color:#f5f7fa!important}
.tk-muted{color:#9aa3af!important}
.tk-line{border-color:#262b33!important}
.tk-tile{background:#1b1f26!important;border-color:#262b33!important}
.tk-track{background:#262b33!important}
.tk-fill{background:#b8ff3c!important}
.tk-moment{background:#1b2412!important;border-color:#b8ff3c!important}
.tk-btn{background:#b8ff3c!important}
.tk-btn a{color:#0b0d10!important}
}
@media (max-width:480px){.tk-pad{padding-left:16px!important;padding-right:16px!important}}
</style>`

// WeeklyHTML is the weekly email: the report's tiles with their change on
// last week, the top sources and pages as bars, the week's findings and one
// button. Tables and inline styles only, 600 px wide, readable with images
// off; everything that came from outside is escaped.
func WeeklyHTML(d Data, x Weekly) string {
	w := d.words()
	subject := w.YourWeek + " · " + d.Site
	var b strings.Builder
	b.WriteString(`<!doctype html><html lang="` + esc(d.Lang) + `" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>` + esc(subject) + `</title>`)
	b.WriteString(`<!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/></o:OfficeDocumentSettings></xml><![endif]-->`)
	b.WriteString(weeklyStyle + `</head>`)
	b.WriteString(`<body class="tk-bg" style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#14161a">`)
	b.WriteString(`<table role="presentation" class="tk-bg" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">`)
	b.WriteString(`<table role="presentation" class="tk-card" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">`)

	// The brand header: the ghost and the name on a dark band, dark in either mode.
	b.WriteString(`<tr><td bgcolor="#0b0d10" class="tk-pad" style="background:#0b0d10;padding:16px 28px;border-bottom:4px solid #b8ff3c"><table role="presentation" cellpadding="0" cellspacing="0"><tr>`)
	b.WriteString(`<td valign="middle"><img src="cid:` + LogoCID + `" alt="" width="36" height="36" style="display:block;width:36px;height:36px;border:0;border-radius:8px"></td>`)
	b.WriteString(`<td valign="middle" style="padding-left:10px;font-size:20px;color:#f5f7fa"><b>trck</b><span style="font-weight:300;color:#b8ff3c">able</span></td>`)
	b.WriteString(`</tr></table></td></tr>`)

	b.WriteString(`<tr><td class="tk-pad" style="padding:24px 28px 8px"><div class="tk-muted" style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280">` + esc(w.YourWeek) + `</div>`)
	b.WriteString(`<div class="tk-ink" style="font-size:22px;font-weight:700;margin-top:4px;color:#14161a">` + esc(d.Site) + `</div>`)
	b.WriteString(`<div class="tk-muted" style="font-size:14px;color:#6b7280;margin-top:2px">` + esc(w.Range(d.From, d.To)) + `</div></td></tr>`)

	if d.Empty() {
		b.WriteString(`<tr><td class="tk-pad tk-ink" style="padding:16px 28px 24px;font-size:15px;color:#14161a">` + esc(w.NoVisitors) + `</td></tr>`)
	} else {
		tiles := d.Tiles()
		b.WriteString(`<tr><td class="tk-pad" style="padding:12px 20px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">`)
		for i := 0; i < len(tiles); i += 2 {
			b.WriteString(`<tr>`)
			for _, t := range tiles[i:min(i+2, len(tiles))] {
				b.WriteString(`<td width="50%" valign="top" style="padding:6px"><div class="tk-tile tk-line" style="border:1px solid #e5e7eb;background:#f9fafb;border-radius:10px;padding:12px 14px">`)
				b.WriteString(`<div class="tk-muted" style="font-size:12px;color:#6b7280">` + esc(t.Label) + `</div>`)
				b.WriteString(`<div class="tk-ink" style="font-size:24px;font-weight:700;margin-top:4px;color:#14161a">` + esc(t.Value) + `</div>`)
				change := t.Change
				if change == "" {
					change = "&nbsp;"
				} else {
					change = esc(change)
				}
				b.WriteString(`<div class="tk-muted" style="font-size:12px;color:#6b7280;margin-top:2px">` + change + `</div></div></td>`)
			}
			b.WriteString(`</tr>`)
		}
		b.WriteString(`</table><div class="tk-muted" style="padding:0 6px;font-size:11px;color:#9ca3af">` + esc(d.Against()) + `</div></td></tr>`)

		for _, list := range []struct {
			title string
			rows  []Row
		}{{w.TopSources, d.Sources()}, {w.TopPages, d.Pages()}} {
			if len(list.rows) == 0 {
				continue
			}
			b.WriteString(`<tr><td class="tk-pad" style="padding:16px 28px 0"><div class="tk-ink" style="font-size:13px;font-weight:700;margin-bottom:6px;color:#14161a">` + esc(list.title) + `</div>`)
			b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">`)
			top := list.rows[0].Value
			for _, r := range list.rows {
				pct := 2
				if top > 0 {
					pct = max(2, int(r.Value*100/top))
				}
				b.WriteString(`<tr><td class="tk-ink" style="padding:6px 8px 3px 0;color:#14161a;max-width:380px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" >` + esc(ellipsize(r.Name, 40)) + `</td>`)
				b.WriteString(`<td class="tk-ink" align="right" style="padding:6px 0 3px;white-space:nowrap;color:#14161a">` + esc(w.Number(r.Value)) + `</td></tr>`)
				b.WriteString(`<tr><td colspan="2" style="padding:0 0 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>`)
				b.WriteString(fmt.Sprintf(`<td class="tk-fill" width="%d%%" height="6" bgcolor="#487f00" style="width:%d%%;height:6px;background:#487f00;border-radius:3px;font-size:0;line-height:0">&nbsp;</td>`, pct, pct))
				if pct < 100 {
					b.WriteString(`<td class="tk-track" bgcolor="#eef0f3" height="6" style="height:6px;background:#eef0f3;border-radius:3px;font-size:0;line-height:0">&nbsp;</td>`)
				}
				b.WriteString(`</tr></table></td></tr>`)
			}
			b.WriteString(`</table></td></tr>`)
		}

		for _, f := range x.Facts {
			b.WriteString(`<tr><td class="tk-pad tk-ink" style="padding:14px 28px 0;font-size:14px;color:#14161a">` + esc(f) + `</td></tr>`)
		}
		for _, m := range x.Moments {
			b.WriteString(`<tr><td class="tk-pad" style="padding:12px 28px 0"><div class="tk-moment tk-ink" style="background:#f2f9e6;border-left:4px solid #487f00;border-radius:6px;padding:10px 14px;font-size:14px;color:#14161a">` + esc(m) + `</div></td></tr>`)
		}
	}

	if x.Link != "" {
		b.WriteString(`<tr><td class="tk-pad" align="center" style="padding:28px 28px 8px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>`)
		b.WriteString(`<td class="tk-btn" bgcolor="#487f00" style="background:#487f00;border-radius:8px"><a href="` + esc(x.Link) + `" style="display:block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">` + esc(w.OpenWeek) + `</a></td>`)
		b.WriteString(`</tr></table></td></tr>`)
	}

	b.WriteString(`<tr><td class="tk-pad tk-muted" style="padding:24px 28px;font-size:12px;color:#6b7280">` + esc(fmt.Sprintf(w.SentBy, "trckable")))
	if d.Unsubscribe != "" {
		b.WriteString(` · <a class="tk-muted" href="` + esc(d.Unsubscribe) + `" style="color:#6b7280">` + esc(w.Stop) + `</a>`)
	}
	b.WriteString(`</td></tr></table></td></tr></table></body></html>`)
	return b.String()
}
