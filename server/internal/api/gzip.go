package api

import (
	"compress/gzip"
	"net/http"
	"strings"

	"github.com/trckable/trckable/server/internal/web"
)

// gzipMin is the size under which an answer is sent as it is: a small body
// costs more to compress than it saves, and most of the API answers small.
const gzipMin = 1024

// plainAnswers are the routes whose answers stay uncompressed.
var plainAnswers = map[string]bool{
	"GET /api/v1/sites/{site}/shares":               true,
	"POST /api/v1/sites/{site}/shares/{id}/address": true,
	"GET /api/v1/sites/{site}/alerts":               true,
}

// withGzip compresses a text answer larger than gzipMin for a browser that
// accepts gzip. It decides on the answer's own type and size, so a live stream
// (text/event-stream) is never buffered: its first write or flush passes
// straight through, and so does anything that is not text (an image, a file).
func withGzip(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Add("Vary", "Accept-Encoding")
		if r.Method == http.MethodHead || r.Header.Get("Range") != "" || !web.Accepts(r.Header.Get("Accept-Encoding"), "gzip") {
			h.ServeHTTP(w, r)
			return
		}
		g := &gzipWriter{ResponseWriter: w}
		defer g.finish()
		h.ServeHTTP(g, r)
	})
}

// textual says whether an answer of this type is worth compressing.
func textual(h http.Header) bool {
	if h.Get("Content-Encoding") != "" {
		return false
	}
	t := strings.ToLower(h.Get("Content-Type"))
	switch {
	case strings.HasPrefix(t, "text/event-stream"):
		return false
	case strings.HasPrefix(t, "application/json"), strings.HasPrefix(t, "text/"), strings.HasPrefix(t, "image/svg+xml"):
		return true
	}
	return false
}

type gzipWriter struct {
	http.ResponseWriter
	status  int
	buf     []byte       // the start of a text answer, until it is known to be big enough
	decided bool         // what to do is settled: gz is set, or the answer goes as it is
	gz      *gzip.Writer // set once the answer is being compressed
}

func (g *gzipWriter) WriteHeader(code int) {
	if g.decided || g.status != 0 {
		return
	}
	if code < 200 { // interim: the real answer is still to come
		g.ResponseWriter.WriteHeader(code)
		return
	}
	g.status = code
	if code == http.StatusNoContent || code == http.StatusNotModified || !textual(g.Header()) {
		g.plain()
	}
}

// plain lets the answer through as it is, with what was held back.
func (g *gzipWriter) plain() {
	g.decided = true
	if g.status == 0 {
		g.status = http.StatusOK
	}
	g.ResponseWriter.WriteHeader(g.status)
	if len(g.buf) > 0 {
		_, _ = g.ResponseWriter.Write(g.buf) //nolint:gosec // the handler's own answer, held back only to decide on compression
		g.buf = nil
	}
}

// compress starts the gzip stream, led by what was held back.
func (g *gzipWriter) compress() {
	g.decided = true
	h := g.Header()
	h.Set("Content-Encoding", "gzip")
	h.Del("Content-Length")
	// A validator of the plain bytes must not be taken for the compressed ones.
	if tag := h.Get("ETag"); tag != "" && !strings.HasPrefix(tag, "W/") {
		h.Set("ETag", "W/"+tag)
	}
	g.ResponseWriter.WriteHeader(g.status)
	g.gz, _ = gzip.NewWriterLevel(g.ResponseWriter, gzip.DefaultCompression)
	_, _ = g.gz.Write(g.buf)
	g.buf = nil
}

func (g *gzipWriter) Write(b []byte) (int, error) {
	if !g.decided {
		if g.status == 0 {
			g.WriteHeader(http.StatusOK)
		}
		if !g.decided {
			g.buf = append(g.buf, b...)
			if len(g.buf) > gzipMin {
				g.compress()
			}
			return len(b), nil
		}
	}
	if g.gz != nil {
		return g.gz.Write(b)
	}
	return g.ResponseWriter.Write(b)
}

// Flush sends what there is now: a stream that asks for it is not held back,
// and a compressed answer is cut at a block end so the browser can read it.
func (g *gzipWriter) Flush() {
	if !g.decided {
		g.plain()
	}
	if g.gz != nil {
		_ = g.gz.Flush()
	}
	if f, ok := g.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// finish ends the answer: a short one goes out as it is, a compressed one is closed.
func (g *gzipWriter) finish() {
	if !g.decided {
		g.plain()
	}
	if g.gz != nil {
		_ = g.gz.Close()
	}
}

// Unwrap lets http.ResponseController reach the real writer.
func (g *gzipWriter) Unwrap() http.ResponseWriter { return g.ResponseWriter }
