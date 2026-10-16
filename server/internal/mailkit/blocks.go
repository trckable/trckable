package mailkit

import (
	"strings"
)

// table opens a layout table; every one is role=presentation with no gaps.
func table(attrs string) string {
	return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"` + attrs + `>`
}

// box writes a tinted box around what inner writes.
func box(p *page, t Tone, align, padding string, inner func()) {
	c := t.tint()
	p.WriteString(table(` width="100%" class="`+c.box+`" bgcolor="`+c.bg+`" style="background:`+c.bg+`;border:1px solid `+c.border+`;border-radius:14px"`) +
		`<tr><td align="` + align + `" class="bp" style="padding:` + padding + `">`)
	inner()
	p.WriteString(`</td></tr></table>`)
}

func lines(s ...string) string {
	var out []string
	for _, l := range s {
		if l = strings.TrimSpace(l); l != "" {
			out = append(out, l)
		}
	}
	return strings.Join(out, "\n")
}

// Heading is the big line at the top: a site's name, or what the email is.
type Heading struct {
	Eyebrow string // a small line above
	Title   string
	Sub     string // a muted line under it
	Link    string // the title opens it
}

func (Heading) gap() int { return 0 }

func (h Heading) html(p *page) {
	if h.Eyebrow != "" {
		p.WriteString(`<div class="mu" style="font-size:13px;font-weight:600;color:` + muted + `;margin:0 0 4px">` + txt(h.Eyebrow) + `</div>`)
	}
	title := txt(h.Title)
	if u := safe(h.Link); u != "" {
		title = `<a href="` + esc(u) + `" class="tx" style="color:` + ink + `;text-decoration:none">` + title + `</a>`
	}
	p.WriteString(`<div class="tx h1" style="font-size:30px;font-weight:800;letter-spacing:-.5px;line-height:36px;color:` + ink + `">` + title + `</div>`)
	if h.Sub != "" {
		p.WriteString(`<div class="mu" style="font-size:14px;color:` + muted + `;margin:4px 0 0">` + txt(h.Sub) + `</div>`)
	}
}

func (h Heading) text() string { return lines(h.Eyebrow, h.Title, h.Sub) }

// Paragraph is a few sentences. Lead is a bold first line.
type Paragraph struct {
	Lead  string
	Text  string
	Muted bool // small and grey: the fine print
}

func (Paragraph) gap() int { return 16 }

func (t Paragraph) html(p *page) {
	class, color, size := "tx", ink, "15px"
	if t.Muted {
		class, color, size = "mu", muted, "13px"
	}
	p.WriteString(`<div class="` + class + `" style="font-size:` + size + `;line-height:1.55;color:` + color + `">`)
	if t.Lead != "" {
		p.WriteString(`<b>` + txt(t.Lead) + `</b><br>`)
	}
	p.WriteString(txt(t.Text) + `</div>`)
}

func (t Paragraph) text() string {
	if t.Lead != "" {
		return t.Lead + "\n" + t.Text
	}
	return t.Text
}

// Badge is a small pill: "Live", "Back up", "Front page".
type Badge struct {
	Text   string
	Tone   Tone
	Dot    bool // a dot before the words
	Center bool // as a block: centred, not on the left
}

func (Badge) gap() int { return 16 }

func (b Badge) pill() string {
	c := b.Tone.tint()
	dot := ""
	if b.Dot {
		dot = `<span class="` + c.wordClass + `" style="color:` + c.word + `">&#9679;</span>&nbsp;`
	}
	return `<span class="` + c.box + ` ` + c.wordClass + `" style="display:inline-block;padding:3px 10px;border:1px solid ` + c.border + `;border-radius:999px;background:` + c.bg + `;color:` + c.word + `;font-size:12px;font-weight:700;line-height:1.5;white-space:nowrap">` + dot + txt(b.Text) + `</span>`
}

func (b Badge) html(p *page) {
	align := "left"
	if b.Center {
		align = "center"
	}
	p.WriteString(`<div style="text-align:` + align + `">` + b.pill() + `</div>`)
}

func (b Badge) text() string { return b.Text }

// Hero is the one big thing: a number with its word, a headline, a picture.
type Hero struct {
	Tone     Tone
	Picture  *Picture // above everything, 120 px
	Confetti bool     // a little confetti around the picture
	Badge    *Badge
	Eyebrow  string
	Live     bool // a green dot before the eyebrow
	Headline string
	Big      string
	Unit     string // the word under the number
	Strong   string // the first words of the line under it, in the tone's colour
	Line     string
	Next     string // a muted last line
}

func (Hero) gap() int { return 16 }

func (h Hero) pictures() []Picture {
	if h.Picture == nil {
		return nil
	}
	return []Picture{*h.Picture}
}

// confetti is a column of little shapes in the brand's party colours.
func confetti(side int) string {
	bits := [][2]string{{"&#9650;", "#ff6fa8"}, {"&#9679;", "#5cc8ff"}, {"&#9632;", "#9bd400"}, {"&#9670;", "#ffb020"}}
	pad := []string{"18px 10px 0 0", "34px 0 0 10px"}[side]
	var b strings.Builder
	b.WriteString(`<td valign="top" style="padding:` + pad + `;font-size:12px;line-height:26px">`)
	for i := range 3 {
		c := bits[(i+side*2)%len(bits)]
		indent := ""
		if (i+side)%2 == 1 {
			indent = "&nbsp;&nbsp;&nbsp;"
		}
		b.WriteString(indent + `<span style="color:` + c[1] + `">` + c[0] + `</span><br>`)
	}
	b.WriteString(`</td>`)
	return b.String()
}

func (h Hero) html(p *page) {
	c := h.Tone.tint()
	box(p, h.Tone, "center", "22px 16px 24px", func() {
		if h.Picture != nil {
			img := `<img src="cid:` + esc(h.Picture.CID) + `" alt="" width="120" height="120" style="display:block;width:120px;height:120px;border:0;margin:0 auto">`
			if h.Confetti {
				p.WriteString(table(` align="center"`) + `<tr>` + confetti(0) + `<td>` + img + `</td>` + confetti(1) + `</tr></table>`)
			} else {
				p.WriteString(img)
			}
		}
		if h.Badge != nil {
			p.WriteString(`<div style="margin:0 0 10px">` + h.Badge.pill() + `</div>`)
		}
		if h.Eyebrow != "" {
			dot := ""
			if h.Live {
				dot = `<span class="okt" style="color:#2fbf71">&#9679;</span>&nbsp; `
			}
			p.WriteString(`<div class="mu" style="font-size:14px;font-weight:600;color:` + muted + `">` + dot + txt(h.Eyebrow) + `</div>`)
		}
		if h.Headline != "" {
			p.WriteString(`<div class="tx" style="font-size:22px;font-weight:700;letter-spacing:-.01em;line-height:1.3;margin:6px 0 12px;color:` + ink + `">` + txt(h.Headline) + `</div>`)
		}
		if h.Big != "" {
			class, color, size := "tx", ink, "56px"
			if h.Tone != Neutral {
				class, color = c.wordClass, c.word
			}
			if len([]rune(h.Big)) > 14 {
				size = "30px"
			}
			p.WriteString(`<div class="hb ` + class + `" style="font-size:` + size + `;font-weight:800;letter-spacing:-.02em;line-height:1.1;margin:6px 0 0;color:` + color + `">` + txt(h.Big) + `</div>`)
		}
		if h.Unit != "" {
			p.WriteString(`<div class="mu" style="font-size:20px;font-weight:500;margin:2px 0 0;color:` + muted + `">` + txt(h.Unit) + `</div>`)
		}
		if h.Strong != "" || h.Line != "" {
			p.WriteString(`<div class="tx" style="font-size:16px;margin:12px 0 0;color:` + ink + `">`)
			if h.Strong != "" {
				g := Good.tint()
				p.WriteString(`<b class="` + g.wordClass + `" style="color:` + g.word + `">` + txt(h.Strong) + `</b> `)
			}
			p.WriteString(txt(h.Line) + `</div>`)
		}
		if h.Next != "" {
			p.WriteString(`<div class="mu" style="font-size:14px;margin:6px 0 0;color:` + muted + `">` + txt(h.Next) + `</div>`)
		}
	})
}

func (h Hero) text() string {
	badge := ""
	if h.Badge != nil {
		badge = h.Badge.Text
	}
	return lines(badge, h.Eyebrow, h.Headline, strings.TrimSpace(h.Big+" "+h.Unit), strings.TrimSpace(h.Strong+" "+h.Line), h.Next)
}

// Stat is one number of a stat row, with its change as a chip.
type Stat struct {
	Label, Value string
	Change       string // "up 13%"; no chip when empty
	Trend        int    // above zero good (green), below bad (red), zero grey
}

// Stats are two to four numbers side by side; four make two rows.
type Stats struct{ Items []Stat }

func (Stats) gap() int { return 16 }

func (s Stats) html(p *page) {
	per := len(s.Items)
	if per > 3 {
		per = 2
	}
	if per == 0 {
		return
	}
	width := itoa(100 / per)
	p.WriteString(table(` width="100%"`))
	for i := 0; i < len(s.Items); i += per {
		if i > 0 {
			p.WriteString(`<tr><td colspan="` + itoa(per) + `" style="height:8px;font-size:0;line-height:0">&nbsp;</td></tr>`)
		}
		p.WriteString(`<tr>`)
		row := s.Items[i:min(i+per, len(s.Items))]
		for j := range per {
			pad := "0 4px"
			switch j {
			case 0:
				pad = "0 4px 0 0"
			case per - 1:
				pad = "0 0 0 4px"
			}
			p.WriteString(`<td width="` + width + `%" valign="top" style="padding:` + pad + `">`)
			if j < len(row) {
				stat(p, row[j])
			}
			p.WriteString(`</td>`)
		}
		p.WriteString(`</tr>`)
	}
	p.WriteString(`</table>`)
}

func stat(p *page, s Stat) {
	box(p, Neutral, "left", "12px 14px", func() {
		p.WriteString(`<div class="mu" style="font-size:12px;font-weight:600;color:` + muted + `">` + txt(s.Label) + `</div>`)
		p.WriteString(`<div class="tx" style="font-size:24px;font-weight:800;letter-spacing:-.02em;line-height:1.2;margin:4px 0 0;color:` + ink + `">` + txt(s.Value) + `</div>`)
		if s.Change == "" {
			p.WriteString(`<div style="font-size:12px;line-height:22px;margin:4px 0 0">&nbsp;</div>`)
			return
		}
		tone, arrow := Neutral, ""
		switch {
		case s.Trend > 0:
			tone, arrow = Good, "&#9650; "
		case s.Trend < 0:
			tone, arrow = Bad, "&#9660; "
		}
		c := tone.tint()
		word, wordClass := c.word, c.wordClass
		if tone == Neutral {
			word, wordClass = muted, "mu"
		}
		p.WriteString(`<div style="margin:4px 0 0"><span class="` + c.box + ` ` + wordClass + `" style="display:inline-block;padding:1px 8px;border-radius:999px;border:1px solid ` + c.border + `;background:` + c.bg + `;color:` + word + `;font-size:12px;font-weight:600;line-height:20px;white-space:nowrap">` + arrow + txt(s.Change) + `</span></div>`)
	})
}

func (s Stats) text() string {
	var out []string
	for _, i := range s.Items {
		l := i.Label + ": " + i.Value
		if i.Change != "" {
			l += " (" + i.Change + ")"
		}
		out = append(out, l)
	}
	return strings.Join(out, "\n")
}

// Callout is a tinted note with a mark: good news, a warning, a problem.
type Callout struct {
	Tone  Tone
	Title string
	Text  string
}

func (Callout) gap() int { return 16 }

func (c Callout) html(p *page) {
	t := c.Tone.tint()
	box(p, c.Tone, "left", "16px 18px", func() {
		p.WriteString(table(` width="100%"`) + `<tr>`)
		if t.glyph != "" {
			p.WriteString(`<td width="24" valign="top" style="padding:1px 12px 0 0">` + table(``) +
				`<tr><td width="24" height="24" align="center" valign="middle" bgcolor="` + t.word + `" style="width:24px;height:24px;border-radius:12px;background:` + t.word + `;color:#ffffff;font-size:13px;font-weight:800;line-height:24px;` + font + `">` + t.glyph + `</td></tr></table></td>`)
		}
		p.WriteString(`<td valign="top" class="tx" style="` + font + `;font-size:15px;line-height:1.55;color:` + ink + `">`)
		if c.Title != "" {
			p.WriteString(`<div class="` + t.wordClass + `" style="font-size:17px;font-weight:700;line-height:1.35;color:` + t.word + `;margin:0 0 4px">` + txt(c.Title) + `</div>`)
		}
		p.WriteString(txt(c.Text) + `</td></tr></table>`)
	})
}

func (c Callout) text() string { return lines(c.Title, c.Text) }

// Rows are labels and values, one line each between hairlines, the value
// bold on the right. A long value
// keeps its end.
type Rows struct {
	Title string
	Rows  [][2]string
}

const rowValueRunes = 30

func (Rows) gap() int { return 16 }

func (r Rows) html(p *page) {
	if len(r.Rows) == 0 {
		return
	}
	if r.Title != "" {
		p.WriteString(`<div class="tx" style="font-size:13px;font-weight:700;margin:0 0 6px;color:` + ink + `">` + txt(r.Title) + `</div>`)
	}
	p.WriteString(table(` width="100%"`))
	for _, row := range r.Rows {
		p.WriteString(`<tr><td class="mu ln" style="padding:10px 12px 10px 0;border-bottom:1px solid ` + line + `;` + font + `;font-size:14px;line-height:20px;color:` + muted + `;white-space:nowrap">` + txt(row[0]) + `</td>`)
		p.WriteString(`<td class="tx ln" align="right" style="padding:10px 0;border-bottom:1px solid ` + line + `;` + font + `;font-size:16px;line-height:20px;font-weight:700;color:` + ink + `">` + txt(Short(row[1], rowValueRunes)) + `</td></tr>`)
	}
	p.WriteString(`</table>`)
}

func (r Rows) text() string {
	out := []string{}
	if r.Title != "" {
		out = append(out, r.Title)
	}
	for _, row := range r.Rows {
		out = append(out, row[0]+": "+row[1])
	}
	return strings.Join(out, "\n")
}

// Button is the one thing to do: a lime pill with an arrow, or a quiet
// outline beside it. Without
// a plain http(s) link there is no button.
type Button struct {
	Label, URL string
	Ghost      bool
}

func (Button) gap() int { return 24 }

func (b Button) html(p *page) {
	u := safe(b.URL)
	if u == "" || b.Label == "" {
		return
	}
	label := b.Label
	if !b.Ghost && !strings.Contains(label, "→") {
		label += " →"
	}
	bg, color, border, class := p.th.btn, p.th.btnInk, p.th.btn, ""
	if b.Ghost {
		bg, color, border, class = "transparent", ink, "#d4d6cf", "gh"
	}
	// Outlook on Windows draws a VML shape; everything else the table.
	width := 64 + 9*len([]rune(label))
	fill := `fillcolor="` + bg + `" stroke="f"`
	if b.Ghost {
		fill = `filled="f" strokecolor="` + border + `"`
	}
	p.WriteString(`<div style="text-align:center"><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="` + esc(u) + `" style="height:48px;v-text-anchor:middle;width:` + itoa(width) + `px" arcsize="50%" ` + fill + `><w:anchorlock/><center style="color:` + color + `;font-family:Arial,sans-serif;font-size:17px;font-weight:bold">` + txt(label) + `</center></v:roundrect><![endif]-->`)
	p.WriteString(`<!--[if !mso]><!-->` + table(` align="center" style="margin:0 auto"`) + `<tr><td align="center" bgcolor="` + bg + `" class="` + class + `" style="background:` + bg + `;border-radius:999px">` +
		`<a href="` + esc(u) + `" class="` + class + `" style="display:inline-block;padding:16px 30px;border:1px solid ` + border + `;border-radius:999px;` + font + `;font-size:17px;font-weight:700;line-height:20px;color:` + color + `;text-decoration:none">` + txt(label) + `</a></td></tr></table><!--<![endif]--></div>`)
}

func (b Button) text() string {
	if u := safe(b.URL); u != "" && b.Label != "" {
		return b.Label + ": " + u
	}
	return ""
}

// Divider is a hairline.
type Divider struct{}

func (Divider) gap() int { return 20 }

func (Divider) html(p *page) {
	p.WriteString(table(` width="100%"`) + `<tr><td class="ln" style="border-top:1px solid ` + line + `;font-size:0;line-height:0;height:1px">&nbsp;</td></tr></table>`)
}

func (Divider) text() string { return "" }

// Mark is a source's little tile, where a favicon would be: a letter on its
// colour. It is drawn, not fetched, so nothing calls anyone when it opens.
type Mark struct {
	Letter string
	Color  string // #rrggbb
}

// Quote is something someone wrote: a mention, a piece of feedback. The card
// says who and where, the title is the link, the text is in quotes.
type Quote struct {
	Mark   Mark
	Source string // "Hacker News"
	Meta   string // "by pg · 212 points"
	Title  string
	Text   string
	URL    string
}

func (Quote) gap() int { return 16 }

func (q Quote) html(p *page) {
	c := Neutral.tint()
	p.WriteString(table(` width="100%" class="cb" bgcolor="#ffffff" style="background:#ffffff;border:1px solid `+c.border+`;border-left:4px solid `+p.th.hot+`;border-radius:14px"`) + `<tr><td class="bp" style="padding:16px 18px">`)
	p.WriteString(table(``) + `<tr>`)
	if q.Mark.Letter != "" {
		color := q.Mark.Color
		if !isHex(color) {
			color = "#6b7078"
		}
		p.WriteString(`<td valign="middle" style="padding:0 10px 0 0">` + table(``) + `<tr><td width="28" height="28" align="center" valign="middle" bgcolor="` + color + `" style="width:28px;height:28px;border-radius:7px;background:` + color + `;color:` + Ink(color) + `;` + font + `;font-size:15px;font-weight:800;line-height:28px">` + esc(q.Mark.Letter) + `</td></tr></table></td>`)
	}
	p.WriteString(`<td valign="middle" class="tx" style="` + font + `;font-size:14px;line-height:1.35;color:` + ink + `"><b>` + txt(q.Source) + `</b>`)
	if q.Meta != "" {
		p.WriteString(`<br><span class="mu" style="font-size:12px;color:` + muted + `">` + txt(q.Meta) + `</span>`)
	}
	p.WriteString(`</td></tr></table>`)
	if q.Title != "" {
		title := txt(q.Title)
		if u := safe(q.URL); u != "" {
			title = `<a href="` + esc(u) + `" class="tx" style="color:` + ink + `;text-decoration:none">` + title + `</a>`
		}
		p.WriteString(`<div class="tx" style="font-size:17px;font-weight:700;line-height:1.4;margin:12px 0 0;color:` + ink + `">` + title + `</div>`)
	}
	if q.Text != "" {
		p.WriteString(`<div class="tx" style="font-size:15px;line-height:1.55;font-style:italic;margin:8px 0 0;color:` + ink + `"><span class="` + p.th.acClass + `" style="font-size:22px;font-weight:800;font-style:normal;line-height:0;color:` + p.th.accent + `">&ldquo;</span>` + txt(q.Text) + `&rdquo;</div>`)
	}
	p.WriteString(`</td></tr></table>`)
}

func (q Quote) text() string {
	head := q.Source
	if q.Meta != "" {
		head += " · " + q.Meta
	}
	t := ""
	if q.Text != "" {
		t = "“" + q.Text + "”"
	}
	return lines(head, q.Title, t, safe(q.URL))
}

// Code is a code to type in, large and spaced: the HTML drops its spaces so a
// copy is just the digits, the text keeps them.
type Code struct{ Code string }

func (Code) gap() int { return 20 }

func (c Code) html(p *page) {
	box(p, Neutral, "center", "22px 12px", func() {
		p.WriteString(`<span class="cd tx" style="font-family:Menlo,Consolas,'Courier New',monospace;font-size:38px;font-weight:700;letter-spacing:.18em;line-height:1;color:` + ink + `;white-space:nowrap">` + esc(strings.ReplaceAll(c.Code, " ", "")) + `</span>`)
	})
}

func (c Code) text() string { return c.Code }
