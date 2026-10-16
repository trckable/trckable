package mailkit

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
)

// Page is one finished email for the preview: what a mail client receives.
type Page struct {
	Name    string // a file name: "alert-surge"
	Subject string
	HTML    string
	Text    string
	Images  []Picture
}

// Inline puts each picture into the HTML as a data: address, so a browser
// shows the email the way a mail client does.
func (p Page) Inline() string {
	h := p.HTML
	for _, img := range p.Images {
		h = strings.ReplaceAll(h, "cid:"+img.CID, "data:"+img.Type+";base64,"+base64.StdEncoding.EncodeToString(img.Data))
	}
	return h
}

// WritePreview writes each email as <name>.html (and its plain text as
// <name>.txt) into dir, and an index.html that shows them side by side.
func WritePreview(dir string, pages []Page) error {
	if err := os.MkdirAll(dir, 0o755); err != nil { //nolint:gosec // a folder the developer named
		return err
	}
	var g strings.Builder
	g.WriteString(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>trckable emails</title><style>` +
		`:root{color-scheme:light dark}body{margin:0;padding:24px 16px;background:#e6e9ee;font:14px/1.5 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#14181d}` +
		`@media (prefers-color-scheme:dark){body{background:#050608;color:#f5f7fa}.card{background:#12151a!important;border-color:#242a33!important}}` +
		`h1{font-size:22px;margin:0 0 4px}p{margin:0 0 20px;opacity:.7}.grid{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}` +
		`.card{background:#fff;border:1px solid #d9dee5;border-radius:14px;padding:12px;width:640px;max-width:100%;box-sizing:border-box}` +
		`.card b{display:block}.card span{display:block;opacity:.7;margin:0 0 8px}.card a{color:inherit}iframe{border:0;width:100%;height:900px;display:block;border-radius:8px}</style></head><body>`)
	g.WriteString(`<h1>trckable emails</h1><p>` + itoa(len(pages)) + ` emails, drawn by the kit. Each opens on its own; the .txt beside it is its plain-text part.</p><div class="grid">`)
	for _, p := range pages {
		page := p.Inline()
		if err := os.WriteFile(filepath.Join(dir, p.Name+".html"), []byte(page), 0o644); err != nil { //nolint:gosec // a preview for the developer
			return err
		}
		if err := os.WriteFile(filepath.Join(dir, p.Name+".txt"), []byte(p.Text), 0o644); err != nil { //nolint:gosec // a preview for the developer
			return err
		}
		g.WriteString(`<div class="card" id="` + esc(p.Name) + `"><b><a href="` + esc(p.Name) + `.html">` + esc(p.Name) + `</a> &middot; <a href="` + esc(p.Name) + `.txt">text</a></b><span>` + esc(p.Subject) + `</span>` +
			`<iframe title="` + esc(p.Name) + `" srcdoc="` + esc(page) + `" onload="this.style.height=this.contentDocument.documentElement.scrollHeight+'px'"></iframe></div>`)
	}
	g.WriteString(`</div></body></html>`)
	return os.WriteFile(filepath.Join(dir, "index.html"), []byte(g.String()), 0o644) //nolint:gosec // a preview for the developer
}
