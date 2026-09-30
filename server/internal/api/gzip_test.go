package api

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func bigJSON() string { return `{"rows":"` + strings.Repeat("trckable ", 400) + `"}` }

func serve(h http.Handler, accept string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	if accept != "" {
		r.Header.Set("Accept-Encoding", accept)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func jsonHandler(body string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Length", "99999") // wrong once compressed: it must go
		w.Header().Set("ETag", `"abc"`)
		_, _ = w.Write([]byte(body))
	})
}

func TestGzipBigJSONIsCompressed(t *testing.T) {
	body := bigJSON()
	w := serve(withGzip(jsonHandler(body)), "gzip, deflate, br")
	if w.Header().Get("Content-Encoding") != "gzip" {
		t.Fatalf("Content-Encoding = %q, want gzip", w.Header().Get("Content-Encoding"))
	}
	if !strings.Contains(w.Header().Get("Vary"), "Accept-Encoding") {
		t.Errorf("Vary = %q, want Accept-Encoding", w.Header().Get("Vary"))
	}
	if w.Header().Get("Content-Length") != "" {
		t.Errorf("Content-Length %q stays on a compressed answer", w.Header().Get("Content-Length"))
	}
	if w.Header().Get("ETag") != `W/"abc"` {
		t.Errorf("ETag = %q, want it weak", w.Header().Get("ETag"))
	}
	zr, err := gzip.NewReader(w.Body)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(zr)
	if string(got) != body {
		t.Fatalf("the compressed answer does not decode to the original (%d vs %d bytes)", len(got), len(body))
	}
	if w.Body.Len() >= len(body)/2 {
		t.Errorf("compressed %d of %d bytes: not smaller", w.Body.Len(), len(body))
	}
}

func TestGzipLeavesSmallAnswersAndOtherClientsAlone(t *testing.T) {
	small := `{"ok":true}`
	if w := serve(withGzip(jsonHandler(small)), "gzip"); w.Header().Get("Content-Encoding") != "" || w.Body.String() != small {
		t.Errorf("a small answer was compressed: %q %q", w.Header().Get("Content-Encoding"), w.Body.String())
	}
	// Exactly 1 KB stays as it is; one byte over is compressed.
	edge := strings.Repeat("a", gzipMin)
	if w := serve(withGzip(jsonHandler(edge)), "gzip"); w.Header().Get("Content-Encoding") != "" {
		t.Error("1 KB exactly was compressed")
	}
	if w := serve(withGzip(jsonHandler(edge+"a")), "gzip"); w.Header().Get("Content-Encoding") != "gzip" {
		t.Error("1 KB and a byte was not compressed")
	}
	big := bigJSON()
	for _, accept := range []string{"", "identity", "br", "gzip;q=0", "*;q=0"} {
		w := serve(withGzip(jsonHandler(big)), accept)
		if w.Header().Get("Content-Encoding") != "" || w.Body.String() != big {
			t.Errorf("Accept-Encoding %q: the answer was compressed", accept)
		}
		if !strings.Contains(w.Header().Get("Vary"), "Accept-Encoding") {
			t.Errorf("Accept-Encoding %q: no Vary", accept)
		}
	}
	if w := serve(withGzip(jsonHandler(big)), "*"); w.Header().Get("Content-Encoding") != "gzip" {
		t.Error("a wildcard accepts gzip")
	}
}

func TestGzipOnlyText(t *testing.T) {
	png := bytes.Repeat([]byte{0x89, 'P', 'N', 'G'}, 600)
	h := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(png)
	})
	if w := serve(withGzip(h), "gzip"); w.Header().Get("Content-Encoding") != "" || !bytes.Equal(w.Body.Bytes(), png) {
		t.Error("an image was compressed")
	}
	csv := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		_, _ = w.Write([]byte(strings.Repeat("a,b,c\n", 500)))
	})
	if w := serve(withGzip(csv), "gzip"); w.Header().Get("Content-Encoding") != "gzip" {
		t.Error("a CSV export was not compressed")
	}
	none := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	if w := serve(withGzip(none), "gzip"); w.Code != http.StatusNoContent || w.Header().Get("Content-Encoding") != "" {
		t.Errorf("204: %d %q", w.Code, w.Header().Get("Content-Encoding"))
	}
	bad := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fail(w, http.StatusBadRequest, "no")
	})
	if w := serve(withGzip(bad), "gzip"); w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "no") {
		t.Errorf("an error answer: %d %q", w.Code, w.Body.String())
	}
}

// A live stream must reach the browser as it is written: nothing held back,
// nothing compressed.
func TestGzipKeepsStreamsUnbuffered(t *testing.T) {
	release := make(chan struct{})
	srv := httptest.NewServer(withGzip(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("event: online\ndata: 1\n\n"))
		_ = http.NewResponseController(w).Flush()
		<-release // the stream is still open
	})))
	defer srv.Close()
	defer close(release)
	req, _ := http.NewRequest(http.MethodGet, srv.URL, nil)
	req.Header.Set("Accept-Encoding", "gzip")
	c := &http.Client{Transport: &http.Transport{DisableCompression: true}, Timeout: 5 * time.Second}
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.Header.Get("Content-Encoding") != "" {
		t.Fatalf("a stream was compressed: %q", resp.Header.Get("Content-Encoding"))
	}
	buf := make([]byte, 64)
	n, err := resp.Body.Read(buf)
	if err != nil || !strings.HasPrefix(string(buf[:n]), "event: online") {
		t.Fatalf("the event did not arrive while the stream is open: %q %v", buf[:n], err)
	}
}

// The real thing: a report is compressed for a browser, and is the same
// bytes once decoded.
func TestReportIsCompressedOverTheWire(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	get := func(accept string) (*http.Response, []byte) {
		req, _ := http.NewRequest(http.MethodGet, g.srv.URL+"/api/v1/sites/"+g.site+"/report?from=2026-08-01&to=2026-09-22&daily=1", nil)
		req.Header.Set("Accept-Encoding", accept)
		plain := &http.Client{Jar: c.Jar, Transport: &http.Transport{DisableCompression: true}, Timeout: 10 * time.Second}
		resp, err := plain.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		return resp, b
	}
	zipped, zb := get("gzip")
	plain, pb := get("identity")
	if len(pb) <= gzipMin {
		t.Skipf("the report is only %d bytes here", len(pb))
	}
	if zipped.Header.Get("Content-Encoding") != "gzip" || plain.Header.Get("Content-Encoding") != "" {
		t.Fatalf("encodings: %q and %q", zipped.Header.Get("Content-Encoding"), plain.Header.Get("Content-Encoding"))
	}
	zr, err := gzip.NewReader(bytes.NewReader(zb))
	if err != nil {
		t.Fatal(err)
	}
	un, _ := io.ReadAll(zr)
	if !bytes.Equal(un, pb) {
		t.Fatal("a report differs once decompressed")
	}
	if len(zb) >= len(pb) {
		t.Errorf("%d bytes compressed, %d plain", len(zb), len(pb))
	}
}
