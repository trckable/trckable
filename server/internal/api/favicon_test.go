package api

import (
	"bytes"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

// siteWithIcon answers one host's home page and /favicon.ico, nothing else.
type siteWithIcon struct{ host string }

func (s siteWithIcon) RoundTrip(r *http.Request) (*http.Response, error) {
	reply := func(code int, body []byte) (*http.Response, error) {
		return &http.Response{StatusCode: code, Body: io.NopCloser(bytes.NewReader(body)), Header: http.Header{}, Request: r}, nil
	}
	if r.URL.Host != s.host {
		return reply(404, nil)
	}
	if r.URL.Path == "/favicon.ico" {
		return reply(200, onePixel)
	}
	return reply(200, []byte("<html></html>"))
}

func TestFaviconPreview(t *testing.T) {
	g := newRig(t)
	g.api.IconGet = &http.Client{Transport: siteWithIcon{host: "good.example.com"}}
	c := client()
	url := g.srv.URL + "/api/v1/favicon?domain="

	if code, _ := do(t, c, "GET", url+"good.example.com", ""); code != http.StatusUnauthorized {
		t.Fatalf("signed out must be refused: %d", code)
	}
	g.setup(t, c)

	res, err := c.Get(url + "good.example.com")
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 200 || res.Header.Get("Content-Type") != "image/png" || !bytes.Equal(got, onePixel) {
		t.Fatalf("preview: %d %q", res.StatusCode, res.Header.Get("Content-Type"))
	}
	if code, _ := do(t, c, "GET", url+"quiet.example.com", ""); code != http.StatusNotFound {
		t.Fatalf("a site without a favicon is 404: %d", code)
	}
	if code, _ := do(t, c, "GET", url+"not%20a%20domain", ""); code != http.StatusBadRequest {
		t.Fatalf("a bad domain is 400: %d", code)
	}
}

func TestFaviconPreviewRefusesPrivateAddresses(t *testing.T) {
	g := newRig(t)
	g.api.IconGet = nil // the guarded client: public hosts only
	c := client()
	g.setup(t, c)
	for _, d := range []string{"10.0.0.1", "127.0.0.1", "192.168.1.5"} {
		if code, _ := do(t, c, "GET", g.srv.URL+"/api/v1/favicon?domain="+d, ""); code != http.StatusNotFound {
			t.Fatalf("%s must not be fetched: %d", d, code)
		}
	}
}

func TestNewSiteKeepsItsFavicon(t *testing.T) {
	g := newRig(t)
	g.api.IconGet = &http.Client{Transport: siteWithIcon{host: "fresh.example.com"}}
	c := client()
	g.setup(t, c)
	code, out := do(t, c, "POST", g.srv.URL+"/api/v1/sites", `{"domain":"fresh.example.com"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("create: %d %v", code, out)
	}
	id, _ := out["id"].(string)
	deadline := time.Now().Add(3 * time.Second)
	for {
		res, err := c.Get(g.srv.URL + "/api/v1/sites/" + id + "/icon")
		if err != nil {
			t.Fatal(err)
		}
		got, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.StatusCode == 200 && bytes.Equal(got, onePixel) {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("the new site never got its favicon: %d %s", res.StatusCode, strings.TrimSpace(string(got)))
		}
		time.Sleep(50 * time.Millisecond)
	}
}
