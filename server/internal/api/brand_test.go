package api

import (
	"bytes"
	"encoding/base64"
	"io"
	"net/http"
	"strings"
	"testing"
)

// A 1×1 PNG.
var onePixel, _ = base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")

func TestSiteBrand(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	put := func(path, typ string, body []byte) int {
		req, _ := http.NewRequest("PUT", g.srv.URL+path, bytes.NewReader(body))
		req.Header.Set("Content-Type", typ)
		req.Header.Set(csrf, "1")
		res, err := c.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		return res.StatusCode
	}
	base := "/api/v1/sites/" + g.site
	if code := put(base+"/icon", "image/png", onePixel); code != http.StatusOK {
		t.Fatalf("upload: %d", code)
	}
	if code := put(base+"/icon", "image/svg+xml", []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)); code != http.StatusBadRequest {
		t.Fatalf("an SVG must be refused: %d", code)
	}
	if code, _ := do(t, c, "PUT", g.srv.URL+base+"/color", `{"color":"#ff5500"}`, csrf, "1"); code != http.StatusOK {
		t.Fatalf("colour: %d", code)
	}
	if code, _ := do(t, c, "PUT", g.srv.URL+base+"/color", `{"color":"red; background:url(x)"}`, csrf, "1"); code != http.StatusBadRequest {
		t.Fatalf("a bad colour must be refused: %d", code)
	}
	_, out := do(t, c, "GET", g.srv.URL+"/api/v1/sites", "")
	site := out["sites"].([]any)[0].(map[string]any)
	if site["color"] != "#ff5500" || !strings.HasPrefix(site["icon_url"].(string), base+"/icon?v=") {
		t.Fatalf("site brand: %v", site)
	}
	res, err := c.Get(g.srv.URL + site["icon_url"].(string))
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.Header.Get("Content-Type") != "image/png" || !bytes.Equal(got, onePixel) {
		t.Fatalf("icon served as %q, %d bytes", res.Header.Get("Content-Type"), len(got))
	}
}

func TestIconLinks(t *testing.T) {
	page := []byte(`<html><head>
<link rel="stylesheet" href="/a.css">
<link rel="icon" href="data:image/svg+xml,%3Csvg%3E">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link href="/img/icon-192.png" rel="icon" sizes="192x192">
<link rel="apple-touch-icon" href="https://cdn.site.com/touch.png">
<link rel="shortcut icon" href="http://site.com/old.ico">
</head></html>`)
	got := iconLinks(page, "https://site.com/")
	want := []string{"https://site.com/img/icon-192.png", "https://cdn.site.com/touch.png"}
	if strings.Join(got, " ") != strings.Join(want, " ") {
		t.Fatalf("got %v, want %v (no data:, no SVG, no plain http)", got, want)
	}
}
