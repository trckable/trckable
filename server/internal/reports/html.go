package reports

import (
	"fmt"
	"html"
	"strings"
)

// LogoCID is the content id the email's inline logo is attached under.
const LogoCID = "logo@report"

// esc escapes text for HTML.
func esc(s string) string { return html.EscapeString(s) }

// HTML is the report as an email: tables and inline styles only, the way mail
// clients want it, readable without images. Everything it prints that came
// from outside (the site, its pages, its sources, the client's name) is
// escaped.
func HTML(d Data) string {
	w, accent := d.words(), d.Accent()
	var b strings.Builder
	b.WriteString(`<!doctype html><html lang="` + esc(d.Lang) + `"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>` + esc(d.Subject()) + `</title></head>`)
	b.WriteString(`<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#14161a">`)
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">`)
	b.WriteString(`<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">`)

	// The header: the logo, or the name, on the brand colour's band.
	b.WriteString(`<tr><td style="padding:20px 28px;border-bottom:4px solid ` + esc(accent) + `">`)
	if len(d.Brand.Logo) > 0 {
		b.WriteString(`<img src="cid:` + LogoCID + `" alt="` + esc(d.Brand.Name) + `" height="32" style="display:block;height:32px;width:auto;max-width:200px;border:0">`)
	} else {
		b.WriteString(`<span style="font-size:18px;font-weight:700;color:` + esc(accent) + `">` + esc(d.Brand.Name) + `</span>`)
	}
	b.WriteString(`</td></tr>`)

	b.WriteString(`<tr><td style="padding:24px 28px 8px"><div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280">` + esc(d.Title()) + `</div>`)
	title := d.Site
	if d.Client != "" {
		title = d.Client
	}
	b.WriteString(`<div style="font-size:22px;font-weight:700;margin-top:4px">` + esc(title) + `</div>`)
	b.WriteString(`<div style="font-size:14px;color:#6b7280;margin-top:2px">` + esc(d.Site) + ` · ` + esc(w.Range(d.From, d.To)) + `</div></td></tr>`)

	if d.Empty() {
		b.WriteString(`<tr><td style="padding:16px 28px 24px;font-size:15px">` + esc(w.NoVisitors) + `</td></tr>`)
	} else {
		b.WriteString(`<tr><td style="padding:12px 20px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>`)
		for _, t := range d.Tiles() {
			b.WriteString(`<td width="25%" valign="top" style="padding:8px"><div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px">`)
			b.WriteString(`<div style="font-size:12px;color:#6b7280">` + esc(t.Label) + `</div>`)
			b.WriteString(`<div style="font-size:20px;font-weight:700;margin-top:4px">` + esc(t.Value) + `</div>`)
			if t.Change != "" {
				b.WriteString(`<div style="font-size:11px;color:#6b7280;margin-top:2px">` + esc(t.Change) + `</div>`)
			}
			b.WriteString(`</div></td>`)
		}
		b.WriteString(`</tr></table><div style="padding:0 8px;font-size:11px;color:#9ca3af">` + esc(d.Against()) + `</div></td></tr>`)
		if amount, change := d.Money(); amount != "" {
			line := esc(w.Revenue) + `: <b>` + esc(amount) + `</b>`
			if change != "" {
				line += ` <span style="color:#6b7280">(` + esc(change) + `)</span>`
			}
			b.WriteString(`<tr><td style="padding:8px 28px;font-size:15px">` + line + `</td></tr>`)
		}
		for _, list := range []struct {
			title string
			rows  []Row
		}{{w.TopSources, d.Sources()}, {w.TopPages, d.Pages()}, {w.TopGoals, d.Goals()}} {
			if len(list.rows) == 0 {
				continue
			}
			b.WriteString(`<tr><td style="padding:12px 28px 0"><div style="font-size:13px;font-weight:700;margin-bottom:6px">` + esc(list.title) + `</div>`)
			b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">`)
			for _, r := range list.rows {
				b.WriteString(`<tr><td style="padding:5px 0;border-top:1px solid #f0f1f3;word-break:break-all">` + esc(r.Name) + `</td><td align="right" style="padding:5px 0;border-top:1px solid #f0f1f3;white-space:nowrap">` + esc(w.Number(r.Value)) + `</td></tr>`)
			}
			b.WriteString(`</table></td></tr>`)
		}
	}

	// The foot: who sent it, and how to stop it.
	b.WriteString(`<tr><td style="padding:24px 28px;font-size:12px;color:#6b7280">`)
	if !d.Brand.HideBrand {
		b.WriteString(esc(fmt.Sprintf(w.SentBy, "trckable")) + ` · `)
	}
	if d.Unsubscribe != "" {
		b.WriteString(`<a href="` + esc(d.Unsubscribe) + `" style="color:#6b7280">` + esc(w.Stop) + `</a>`)
	}
	b.WriteString(`</td></tr></table></td></tr></table></body></html>`)
	return b.String()
}

// Text is the same report as plain text, for the clients that show only that.
func Text(d Data) string {
	w := d.words()
	var l []string
	title := d.Site
	if d.Client != "" {
		title = d.Client
	}
	l = append(l, d.Title()+" — "+title, d.Site+" · "+w.Range(d.From, d.To), "")
	if d.Empty() {
		l = append(l, w.NoVisitors)
	} else {
		for _, t := range d.Tiles() {
			line := t.Label + ": " + t.Value
			if t.Change != "" {
				line += " (" + t.Change + ")"
			}
			l = append(l, line)
		}
		l = append(l, "("+d.Against()+")")
		if amount, change := d.Money(); amount != "" {
			line := w.Revenue + ": " + amount
			if change != "" {
				line += " (" + change + ")"
			}
			l = append(l, line)
		}
		for _, list := range []struct {
			title string
			rows  []Row
		}{{w.TopSources, d.Sources()}, {w.TopPages, d.Pages()}, {w.TopGoals, d.Goals()}} {
			if len(list.rows) == 0 {
				continue
			}
			l = append(l, "", list.title)
			for _, r := range list.rows {
				l = append(l, "  "+r.Name+" — "+w.Number(r.Value))
			}
		}
	}
	l = append(l, "", "--")
	if !d.Brand.HideBrand {
		l = append(l, fmt.Sprintf(w.SentBy, "trckable"))
	}
	if d.Unsubscribe != "" {
		l = append(l, w.Stop+": "+d.Unsubscribe)
	}
	return strings.Join(l, "\n")
}
