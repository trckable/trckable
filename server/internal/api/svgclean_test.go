package api

import (
	"strings"
	"testing"
)

const okLogo = `<?xml version="1.0"?><!-- made in an editor --><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" width="40" height="40">` +
	`<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs>` +
	`<title>Acme &amp; Co</title><style>.a{fill:url(#g)}</style><g class="a"><path d="M0 0h10v10z" fill="#112233" style="stroke:url(#g)"/><use xlink:href="#g"/></g></svg>`

func TestCleanSVGKeepsADrawingAndWritesItAgain(t *testing.T) {
	out, err := cleanSVG([]byte(okLogo))
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	for _, want := range []string{`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"`, `<path d="M0 0h10v10z" fill="#112233"`, `href="#g"`, `Acme &amp; Co`} {
		if !strings.Contains(s, want) {
			t.Errorf("cleaned SVG lacks %q:\n%s", want, s)
		}
	}
	for _, gone := range []string{"<?xml", "<!--", "xlink", "xmlns:"} {
		if strings.Contains(s, gone) {
			t.Errorf("cleaned SVG still has %q:\n%s", gone, s)
		}
	}
}

// Each of these is a way an SVG runs code or reaches for another file. All of
// them are refused, not quietly edited.
func TestCleanSVGRefusesWhatCanRunOrLoad(t *testing.T) {
	const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">`
	bad := map[string]string{
		"script element":     open + `<script>alert(1)</script></svg>`,
		"event handler":      open + `<rect width="1" height="1" onload="alert(1)"/></svg>`,
		"javascript link":    open + `<a href="javascript:alert(1)"><rect width="1" height="1"/></a></svg>`,
		"foreignObject":      open + `<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>`,
		"external image":     open + `<image href="https://example.com/x.png"/></svg>`,
		"external use":       open + `<use href="https://example.com/x.svg#a"/></svg>`,
		"external url()":     open + `<rect width="1" height="1" fill="url(https://example.com/a)"/></svg>`,
		"css import":         open + `<style>@import url(https://example.com/a.css);</style></svg>`,
		"css script url":     open + `<rect style="background:url(javascript:alert(1))" width="1" height="1"/></svg>`,
		"doctype":            `<!DOCTYPE svg [<!ENTITY x "y">]>` + open + `</svg>`,
		"another root":       `<html xmlns="http://www.w3.org/1999/xhtml"></html>`,
		"no namespace":       `<svg viewBox="0 0 1 1"></svg>`,
		"not closed":         open + `<g>`,
		"text, not svg":      `hello`,
		"smil animate":       open + `<rect width="1" height="1"><animate attributeName="href" to="javascript:alert(1)"/></rect></svg>`,
		"prefixed attribute": open + `<rect width="1" height="1" xlink:actuate="onLoad"/></svg>`,
	}
	for name, in := range bad {
		if out, err := cleanSVG([]byte(in)); err == nil {
			t.Errorf("%s was accepted:\n%s", name, out)
		}
	}
	var deep strings.Builder
	deep.WriteString(open)
	for range maxSVGTokens {
		deep.WriteString("<g>")
	}
	if _, err := cleanSVG([]byte(deep.String())); err == nil {
		t.Error("a file of thousands of elements was accepted")
	}
}
