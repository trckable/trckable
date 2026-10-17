package mailkit

import "strings"

// MentionRow is one place the site was talked about: the source's mark, the
// post's title as the link, and the visitors it brought.
type MentionRow struct {
	Mark     Mark
	Source   string // "Hacker News"
	Title    string
	URL      string
	Visitors int64
}

// Mentions is the weekly email's "who talked about you": a few rows, each a
// tile, a linked title and a bold count, and a link to the rest.
type Mentions struct {
	Title   string
	Rows    []MentionRow
	More    string // "+3 more"
	MoreURL string
}

func (Mentions) gap() int { return 20 }

func (m Mentions) html(p *page) {
	if len(m.Rows) == 0 {
		return
	}
	if m.Title != "" {
		p.WriteString(`<div class="tx" style="font-size:13px;font-weight:700;margin:0 0 4px;color:` + ink + `">` + txt(m.Title) + `</div>`)
	}
	p.WriteString(table(` width="100%"`))
	for _, r := range m.Rows {
		color := r.Mark.Color
		if !isHex(color) {
			color = "#6b7078"
		}
		title := txt(Cut(r.Title, 90))
		if u := safe(r.URL); u != "" {
			title = `<a href="` + esc(u) + `" class="tx" style="color:` + ink + `;text-decoration:none">` + title + `</a>`
		}
		p.WriteString(`<tr><td valign="middle" class="ln" style="padding:10px 10px 10px 0;border-bottom:1px solid ` + line + `">` + table(``) + `<tr><td width="28" height="28" align="center" valign="middle" bgcolor="` + color + `" style="width:28px;height:28px;border-radius:7px;background:` + color + `;color:` + Ink(color) + `;` + font + `;font-size:15px;font-weight:800;line-height:28px">` + esc(r.Mark.Letter) + `</td></tr></table></td>` +
			`<td valign="middle" class="tx ln" style="padding:10px 8px 10px 0;border-bottom:1px solid ` + line + `;` + font + `;font-size:14px;line-height:1.35;color:` + ink + `">` + title + `<br><span class="mu" style="font-size:12px;color:` + muted + `">` + txt(r.Source) + `</span></td>` +
			`<td valign="middle" align="right" class="tx ln" style="padding:10px 0;border-bottom:1px solid ` + line + `;` + font + `;font-size:16px;line-height:20px;font-weight:700;color:` + ink + `;white-space:nowrap">` + txt(Number(r.Visitors)) + `</td></tr>`)
	}
	p.WriteString(`</table>`)
	if u := safe(m.MoreURL); u != "" && m.More != "" {
		p.WriteString(`<div style="margin:8px 0 0;` + font + `;font-size:13px"><a href="` + esc(u) + `" class="mu" style="color:` + muted + `;text-decoration:underline">` + txt(m.More) + `</a></div>`)
	}
}

func (m Mentions) text() string {
	out := []string{}
	if m.Title != "" {
		out = append(out, m.Title)
	}
	for _, r := range m.Rows {
		out = append(out, strings.TrimSpace(r.Source+" · "+Cut(r.Title, 90)+": "+Number(r.Visitors)))
		if u := safe(r.URL); u != "" {
			out = append(out, u)
		}
	}
	if m.More != "" {
		out = append(out, m.More+" "+safe(m.MoreURL))
	}
	return strings.Join(out, "\n")
}
