package api

import (
	"bytes"
	"encoding/xml"
	"errors"
	"io"
	"regexp"
	"strings"
)

// An SVG is code as much as a picture: it can carry script, load other
// files and reach out of the page. A logo that came from an owner is cleaned
// by a list of what is allowed, never by a list of what is not: the file is
// read, anything outside the list makes it refused (it is not quietly
// edited), and what is kept is written out again from the tokens read, so
// nothing the parser did not understand can ride along.
//
// The logo is also only ever shown as an <img> and served with a policy that
// allows no script and no loading at all (shareLogo), so this is the second
// of two locks.

const svgNS = "http://www.w3.org/2000/svg"

// maxSVGTokens keeps a hostile file from costing more than a moment.
const maxSVGTokens = 4000

var svgElements = setOf("svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
	"defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "symbol", "use", "title", "desc", "text", "tspan", "style")

var svgAttrs = setOf("viewBox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy", "d", "points",
	"fill", "fill-opacity", "fill-rule", "clip-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
	"stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "opacity", "transform", "id", "class", "style", "offset", "stop-color", "stop-opacity",
	"gradientUnits", "gradientTransform", "spreadMethod", "clipPathUnits", "maskUnits", "clip-path", "mask", "preserveAspectRatio",
	"font-family", "font-size", "font-weight", "text-anchor", "dx", "dy", "letter-spacing", "version", "href")

func setOf(names ...string) map[string]bool {
	m := make(map[string]bool, len(names))
	for _, n := range names {
		m[n] = true
	}
	return m
}

var (
	cssURL      = regexp.MustCompile(`(?i)url\(`)
	cssLocalURL = regexp.MustCompile(`(?i)url\(\s*['"]?#`)
)

// safeValue says whether an attribute's value or a style sheet is plain
// presentation: no script, no data: address, no other file, no @-rule (that
// is how a style sheet imports one), and a url() only to something in the
// same file.
func safeValue(v string) bool {
	l := strings.ToLower(v)
	for _, bad := range []string{"javascript", "data:", "vbscript", "expression", "image-set", "@", "<", "\\", "&"} {
		if strings.Contains(l, bad) {
			return false
		}
	}
	return len(cssURL.FindAllString(v, -1)) == len(cssLocalURL.FindAllString(v, -1))
}

// cleanSVG returns the logo in svg as a clean file, or an error that says
// what to change.
func cleanSVG(svg []byte) ([]byte, error) {
	dec := xml.NewDecoder(bytes.NewReader(svg))
	dec.Strict = true
	dec.Entity = nil // no entities: nothing expands into something else
	var out bytes.Buffer
	var open []string
	skip := 0 // inside an editor's own element: read and dropped
	tokens := 0
	seenRoot := false
	for {
		tok, err := dec.Token()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, errors.New("that file is not a valid SVG")
		}
		if tokens++; tokens > maxSVGTokens {
			return nil, errors.New("that SVG is too complex for a logo")
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if skip > 0 {
				skip++
				continue
			}
			if editorName(t.Name) {
				skip = 1
				continue
			}
			if len(open) > 0 && open[len(open)-1] == "style" {
				return nil, errors.New("that SVG's style sheet holds more than text")
			}
			if t.Name.Space != svgNS || !svgElements[t.Name.Local] {
				return nil, errors.New("that SVG uses something a logo may not: " + t.Name.Local)
			}
			if len(open) == 0 {
				if t.Name.Local != "svg" || seenRoot {
					return nil, errors.New("that file is not an SVG logo")
				}
				seenRoot = true
			}
			out.WriteString("<" + t.Name.Local)
			if len(open) == 0 {
				out.WriteString(` xmlns="` + svgNS + `"`)
			}
			for _, at := range t.Attr {
				name, ok := attrName(at)
				if !ok {
					continue // a namespace declaration: the root's own is written above
				}
				if !svgAttrs[name] || !safeValue(at.Value) || (name == "href" && !strings.HasPrefix(at.Value, "#")) {
					return nil, errors.New("that SVG uses something a logo may not: " + name)
				}
				out.WriteString(" " + name + `="`)
				_ = xml.EscapeText(&out, []byte(at.Value))
				out.WriteString(`"`)
			}
			out.WriteString(">")
			open = append(open, t.Name.Local)
		case xml.EndElement:
			if skip > 0 {
				skip--
				continue
			}
			out.WriteString("</" + t.Name.Local + ">")
			open = open[:len(open)-1]
		case xml.CharData:
			if skip > 0 {
				continue
			}
			if len(open) > 0 && open[len(open)-1] == "style" && !safeValue(string(t)) {
				return nil, errors.New("that SVG's style sheet uses something a logo may not")
			}
			_ = xml.EscapeText(&out, t)
		case xml.Comment, xml.ProcInst:
			// Dropped: an editor's note, or the XML line.
		case xml.Directive:
			return nil, errors.New("that SVG has a DOCTYPE, which a logo may not")
		}
	}
	if !seenRoot || len(open) != 0 {
		return nil, errors.New("that file is not an SVG logo")
	}
	return out.Bytes(), nil
}

// editorName says an element or attribute is an editor's own bookkeeping
// (Inkscape, Illustrator, RDF metadata): it draws nothing, so it is dropped
// rather than the whole file refused.
func editorName(n xml.Name) bool {
	for _, ns := range []string{"inkscape", "sodipodi", "rdf-syntax", "creativecommons", "purl.org", "adobe.com", "w3.org/XML/1998/namespace"} {
		if strings.Contains(n.Space, ns) {
			return true
		}
	}
	switch n.Space {
	case "rdf", "cc", "dc", "i", "x", "xml":
		return true
	}
	return n.Space == svgNS && n.Local == "metadata"
}

// attrName reads an attribute's name: plain, or xlink:href (written as
// href). A namespace declaration or an editor's attribute is skipped (ok
// false); any other prefixed attribute is returned as it is, so the list
// refuses it.
func attrName(a xml.Attr) (string, bool) {
	switch {
	case a.Name.Space == "xmlns" || (a.Name.Space == "" && a.Name.Local == "xmlns"):
		return "", false
	case a.Name.Space == "http://www.w3.org/1999/xlink" && a.Name.Local == "href":
		return "href", true
	case editorName(a.Name) || (a.Name.Space == "" && strings.HasPrefix(a.Name.Local, "data-")):
		return "", false
	case a.Name.Space != "":
		return a.Name.Space + ":" + a.Name.Local, true
	}
	return a.Name.Local, true
}
