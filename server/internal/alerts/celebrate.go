package alerts

import (
	_ "embed"
	"strings"
)

// CheerCID is the content id the celebration picture travels under.
const CheerCID = "cheer@alert"

// Cheer is the ghost with its arms up and a little confetti (cheer.svg
// rendered at twice the size it is shown).
//
//go:embed cheer.png
var Cheer []byte

// celebrateCSS is the dark side of the celebration box: a faint lime tint
// stays, the number turns lime.
const celebrateCSS = `
@media (prefers-color-scheme: dark){
.cz{background:#171d0d !important;border-color:#2e3b12 !important}
.hn{color:#c6ff3a !important}
}`

// celebration is the box of a card that has a Headline: the cheering ghost,
// the warm line, the number as the hero in lime, one line of real context and
// what comes next. Tinted lime, light by default.
func (c Card) celebration() string {
	var b strings.Builder
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="cz" style="background:#f3fadb;border:1px solid #dcebaa;border-radius:14px"><tr><td align="center" style="padding:20px 14px 24px">`)
	b.WriteString(`<img src="cid:` + CheerCID + `" alt="" width="120" height="120" style="display:block;width:120px;height:120px;border:0;margin:0 auto 6px">`)
	b.WriteString(`<div class="tx" style="font-size:22px;font-weight:700;letter-spacing:-.01em;line-height:1.3;margin:0 0 12px;color:#16181c">` + txt(c.Headline) + `</div>`)
	b.WriteString(`<div class="hn" style="font-size:60px;font-weight:800;letter-spacing:-.02em;line-height:1.1;color:#4f7d00">` + txt(c.Big) + `</div>`)
	if c.Unit != "" {
		b.WriteString(`<div class="mu" style="font-size:20px;font-weight:500;margin:2px 0 0;color:#5d6350">` + txt(c.Unit) + `</div>`)
	}
	if c.Sub != "" {
		b.WriteString(`<div class="tx" style="font-size:16px;margin:14px 0 0;color:#16181c">` + txt(c.Sub) + `</div>`)
	}
	if c.Next != "" {
		b.WriteString(`<div class="mu" style="font-size:14px;margin:6px 0 0;color:#5d6350">` + txt(c.Next) + `</div>`)
	}
	b.WriteString(`</td></tr></table>`)
	return b.String()
}
