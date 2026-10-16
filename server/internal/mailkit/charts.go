package mailkit

import (
	"strconv"
	"strings"
)

func itoa(n int) string { return strconv.Itoa(n) }

// Number writes a count with thousands commas: 12,450.
func Number(n int64) string {
	s := strconv.FormatInt(n, 10)
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	if neg {
		return "-" + s
	}
	return s
}

// Spark is a small column chart drawn with table cells, so it shows with
// images off and in every client: one bar per value, the last ones lit.
type Spark struct {
	Caption  string   // a muted line above: "People online, the last 30 minutes"
	Values   []int64  // oldest first
	Ticks    []string // a label under each bar ("Mon"); or none
	From, To string   // labels under the first and the last bar, without Ticks
	Hot      int      // how many of the last bars are lit; 1 when zero
	Peak     bool     // light the highest bar instead of the last
	Height   int      // the tallest bar, in pixels; 64 when zero
}

func (Spark) gap() int { return 16 }

func (s Spark) html(p *page) {
	if len(s.Values) == 0 {
		return
	}
	h := s.Height
	if h == 0 {
		h = 64
	}
	hot := s.Hot
	if hot == 0 {
		hot = 1
	}
	var top int64
	peak := 0
	for i, v := range s.Values {
		if v > top {
			top, peak = v, i
		}
	}
	if s.Caption != "" {
		p.WriteString(`<div class="mu" style="font-size:13px;font-weight:600;margin:0 0 8px;color:` + muted + `">` + txt(s.Caption) + `</div>`)
	}
	n := len(s.Values)
	gapPx := 2
	if n <= 12 {
		gapPx = 4
	}
	width := strconv.FormatFloat(100/float64(n), 'f', 2, 64)
	p.WriteString(table(` width="100%" style="table-layout:fixed"`) + `<tr>`)
	for i, v := range s.Values {
		bar := 3
		if top > 0 {
			bar = max(3, int(v*int64(h)/top))
		}
		color, class := "#d9dee5", "bar"
		if lit := i >= n-hot; s.Peak && i == peak || !s.Peak && lit {
			color, class = p.th.hot, p.th.hotClass
		}
		pad := "0 " + px(gapPx/2)
		p.WriteString(`<td valign="bottom" width="` + width + `%" height="` + itoa(h) + `" style="width:` + width + `%;height:` + px(h) + `;padding:` + pad + `">` +
			table(` width="100%"`) + `<tr><td height="` + itoa(bar) + `" bgcolor="` + color + `" class="` + class + `" style="height:` + px(bar) + `;background:` + color + `;border-radius:3px 3px 0 0;font-size:0;line-height:0;mso-line-height-rule:exactly">&nbsp;</td></tr></table></td>`)
	}
	p.WriteString(`</tr>`)
	switch {
	case len(s.Ticks) == n:
		p.WriteString(`<tr>`)
		for _, t := range s.Ticks {
			p.WriteString(`<td align="center" width="` + width + `%" class="mu" style="padding:6px 0 0;` + font + `;font-size:11px;color:` + muted + `">` + txt(t) + `</td>`)
		}
		p.WriteString(`</tr>`)
	case s.From != "" || s.To != "":
		half := n / 2
		p.WriteString(`<tr><td colspan="` + itoa(half) + `" class="mu" style="padding:6px 0 0;` + font + `;font-size:11px;color:` + muted + `">` + txt(s.From) + `</td>` +
			`<td colspan="` + itoa(n-half) + `" align="right" class="mu" style="padding:6px 0 0;` + font + `;font-size:11px;color:` + muted + `">` + txt(s.To) + `</td></tr>`)
	}
	p.WriteString(`</table>`)
}

func (s Spark) text() string {
	if len(s.Values) == 0 {
		return ""
	}
	var parts []string
	if len(s.Ticks) == len(s.Values) {
		for i, v := range s.Values {
			parts = append(parts, s.Ticks[i]+" "+Number(v))
		}
		return s.Caption + ": " + strings.Join(parts, " · ")
	}
	var top int64
	for _, v := range s.Values {
		top = max(top, v)
	}
	return s.Caption + ": " + Number(s.Values[0]) + " → " + Number(s.Values[len(s.Values)-1]) + " (peak " + Number(top) + ")"
}

// Bar is one line of a List: a name, its value, and its count for the bar.
type Bar struct {
	Name, Value string
	N           int64
}

// List is a short ranking with a bar under each line, the first one full.
type List struct {
	Title string
	Rows  []Bar
}

func (List) gap() int { return 20 }

func (l List) html(p *page) {
	if len(l.Rows) == 0 {
		return
	}
	if l.Title != "" {
		p.WriteString(`<div class="tx" style="font-size:13px;font-weight:700;margin:0 0 4px;color:` + ink + `">` + txt(l.Title) + `</div>`)
	}
	top := l.Rows[0].N
	for _, r := range l.Rows {
		top = max(top, r.N)
	}
	p.WriteString(table(` width="100%"`))
	for _, r := range l.Rows {
		pct := 2
		if top > 0 {
			pct = max(2, int(r.N*100/top))
		}
		p.WriteString(`<tr><td class="tx" style="padding:8px 8px 4px 0;` + font + `;font-size:14px;color:` + ink + `;word-break:break-all">` + txt(r.Name) + `</td>` +
			`<td class="tx" align="right" style="padding:8px 0 4px;` + font + `;font-size:14px;font-weight:700;color:` + ink + `;white-space:nowrap">` + txt(r.Value) + `</td></tr>`)
		p.WriteString(`<tr><td colspan="2">` + meter(p, pct, 6) + `</td></tr>`)
	}
	p.WriteString(`</table>`)
}

// meter is a bar pct wide on its track.
func meter(p *page, pct, height int) string {
	h := px(height)
	out := table(` width="100%"`) + `<tr><td width="` + itoa(pct) + `%" height="` + itoa(height) + `" bgcolor="` + p.th.hot + `" class="` + p.th.hotClass + `" style="width:` + itoa(pct) + `%;height:` + h + `;background:` + p.th.hot + `;border-radius:3px;font-size:0;line-height:0;mso-line-height-rule:exactly">&nbsp;</td>`
	if pct < 100 {
		out += `<td height="` + itoa(height) + `" bgcolor="#e9edf1" class="trk" style="height:` + h + `;background:#e9edf1;border-radius:3px;font-size:0;line-height:0;mso-line-height-rule:exactly">&nbsp;</td>`
	}
	return out + `</tr></table>`
}

func (l List) text() string {
	if len(l.Rows) == 0 {
		return ""
	}
	var out []string
	if l.Title != "" {
		out = append(out, l.Title)
	}
	for _, r := range l.Rows {
		out = append(out, "  "+r.Name+" — "+r.Value)
	}
	return strings.Join(out, "\n")
}

// Progress is the way to a goal: a label, how far, and a bar.
type Progress struct {
	Label string  // "Next up: 25,000"
	Note  string  // "40% of the way"
	Value float64 // where it is
	Of    float64 // where the goal is
}

func (Progress) gap() int { return 20 }

func (g Progress) html(p *page) {
	if g.Of <= 0 {
		return
	}
	pct := int(g.Value * 100 / g.Of)
	pct = min(100, max(2, pct))
	p.WriteString(table(` width="100%"`) + `<tr><td class="tx" style="padding:0 0 6px;` + font + `;font-size:14px;font-weight:700;color:` + ink + `">` + txt(g.Label) + `</td>` +
		`<td class="mu" align="right" style="padding:0 0 6px;` + font + `;font-size:13px;color:` + muted + `;white-space:nowrap">` + txt(g.Note) + `</td></tr>` +
		`<tr><td colspan="2">` + meter(p, pct, 8) + `</td></tr></table>`)
}

func (g Progress) text() string {
	if g.Of <= 0 {
		return ""
	}
	if g.Note != "" {
		return g.Label + " (" + g.Note + ")"
	}
	return g.Label
}
