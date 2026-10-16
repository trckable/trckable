package mailkit

import (
	_ "embed"
	"strings"
)

// Tone tints a box, a badge or a chip.
type Tone int

const (
	Neutral Tone = iota // the soft grey box of the sign-in code
	Celebrate
	Good
	Bad
	Warn
	Info
)

// tint is a tone on a light page, and the classes that turn it over on a dark
// one: box is background and border, word is the tone's own text colour.
type tint struct {
	bg, border, word string
	box, wordClass   string
	glyph            string // the callout's mark
}

var tints = map[Tone]tint{
	Neutral:   {bg: "#f2f4f7", border: line, word: ink, box: "cb", wordClass: "tx"},
	Celebrate: {bg: "#f3fadb", border: "#dcebaa", word: "#4f7d00", box: "lg", wordClass: "ac", glyph: "&#9733;"},
	Good:      {bg: "#ecf8f1", border: "#c9ead6", word: "#177a44", box: "ok", wordClass: "okt", glyph: "&#10003;"},
	Bad:       {bg: "#fdf1f0", border: "#f4d3cf", word: "#b42318", box: "bd", wordClass: "bdt", glyph: "!"},
	Warn:      {bg: "#fdf6e6", border: "#f1e1b4", word: "#8a5a00", box: "wn", wordClass: "wnt", glyph: "!"},
	Info:      {bg: "#eef4fc", border: "#d4e3f5", word: "#1f5fa8", box: "in", wordClass: "int", glyph: "i"},
}

func (t Tone) tint() tint {
	if c, ok := tints[t]; ok {
		return c
	}
	return tints[Neutral]
}

// dark is what each class becomes on a dark page.
var dark = [][2]string{
	{"bg", "background:#0b0d10"},
	{"cd0", "background:#12151a;border-color:#242a33"},
	{"tx", "color:#f5f7fa"},
	{"mu", "color:#a7b0bd"},
	{"cb", "background:#181c22;border-color:#242a33"},
	{"ln", "border-color:#242a33"},
	{"ac", "color:#c6ff3a"},
	{"cd", "color:#c6ff3a"},
	{"lg", "background:#171d0d;border-color:#2e3b12"},
	{"ok", "background:#0f1d15;border-color:#1d3b29"},
	{"okt", "color:#3ddc84"},
	{"bd", "background:#221312;border-color:#3f201d"},
	{"bdt", "color:#ff8a7f"},
	{"wn", "background:#211a0b;border-color:#3e3013"},
	{"wnt", "color:#f5c451"},
	{"in", "background:#0f1724;border-color:#1f2e46"},
	{"int", "color:#8ab8ff"},
	{"bar", "background:#2a2f37"},
	{"trk", "background:#1b1f25"},
	{"hot", "background:#c6ff3a"},
	{"gh", "border-color:#3a414c;color:#f5f7fa"},
}

// css is the style block. Light is every element's own inline style, so a
// client that drops the block still shows a light email; the dark rules are
// written twice, for prefers-color-scheme and for Outlook.com's attributes.
var css = func() string {
	var media, ogsc strings.Builder
	for _, d := range dark {
		decl := strings.ReplaceAll(d[1], ";", " !important;") + " !important"
		media.WriteString("." + d[0] + "{" + decl + "}")
		ogsc.WriteString("[data-ogsc] ." + d[0] + ",[data-ogsb] ." + d[0] + "{" + decl + "}")
	}
	return `:root{color-scheme:light dark;supported-color-schemes:light dark}` +
		`body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}` +
		`table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}img{-ms-interpolation-mode:bicubic}` +
		`a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;font-size:inherit !important;font-family:inherit !important;font-weight:inherit !important;line-height:inherit !important}` +
		`u + #body a{color:inherit;text-decoration:none}#MessageViewBody a{color:inherit;text-decoration:none}` +
		`@media (max-width:600px){.gut{padding:16px 8px !important}.pad{padding-left:22px !important;padding-right:22px !important}.top{padding:24px 22px 0 !important}.h1{font-size:26px !important;line-height:32px !important}.hb{font-size:44px !important}.bp{padding-left:14px !important;padding-right:14px !important}}` +
		`@media (prefers-color-scheme:dark){` + media.String() + `}` + ogsc.String()
}()

// Picture is an image that travels with the email, shown as cid:<CID>.
type Picture struct {
	CID, Name, Type string
	Data            []byte
}

// LogoCID is the content id of the header's logo, the ghost or a client's.
const LogoCID = "logo@report"

//go:embed logo.png
var logoPNG []byte

// Cheer is the ghost with its arms up and a little confetti (cheer.svg
// rendered at twice the size it is shown).
//
//go:embed cheer.png
var cheerPNG []byte

// Logo is trckable's ghost as a small PNG: mail clients cannot draw the
// dashboard's SVG.
var Logo = Picture{CID: LogoCID, Name: "logo.png", Type: "image/png", Data: logoPNG}

// Cheer is the celebration picture.
var Cheer = Picture{CID: "cheer@alert", Name: "cheer.png", Type: "image/png", Data: cheerPNG}
