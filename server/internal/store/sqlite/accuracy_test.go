package sqlite

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/ingest"
	"github.com/trckable/trckable/server/internal/wal"
)

// Accuracy scenario: a visit from a rented server is a script, not a reader,
// and a site that never touched its settings counts it as one from the first
// event, through the store's own defaults and the real ingest path.
func TestAccuracyDataCentreVisitsAreDroppedByDefault(t *testing.T) {
	s := openT(t)
	ctx := context.Background()
	id, err := s.CreateSite(ctx, DefaultAccount, "shop.example", "Shop")
	if err != nil {
		t.Fatal(err)
	}
	l, err := wal.Open(t.TempDir(), wal.Options{NoSync: true})
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	h := &ingest.Handler{
		Log:      l,
		Sites:    s,
		Salts:    ingest.NewSalts(nil),
		ClientIP: ingest.RemoteIP,
		Hosting:  func(ip string) bool { return ip == "203.0.113.50" }, // a data centre
		Now:      func() time.Time { return time.Date(2026, 9, 22, 12, 0, 0, 0, time.UTC) },
	}
	visit := func(addr string) {
		req := httptest.NewRequest(http.MethodPost, "/api/e", strings.NewReader(`{"s":"`+id+`","k":"pv","u":"https://shop.example/"}`))
		req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36")
		req.RemoteAddr = addr
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		if w.Code != http.StatusAccepted {
			t.Fatalf("status %d", w.Code)
		}
	}
	stored := func() uint64 { n, _ := l.Committed(); return n }

	visit("203.0.113.50:1000") // from the data centre
	visit("198.51.100.7:1000") // from a home
	if n := stored(); n != 1 {
		t.Fatalf("a new site stored %d visits of 2, want only the person's", n)
	}

	c, _ := s.SiteConfig(ctx, id)
	c.BotStrict = false // the owner wants them back
	if err := s.SetSiteConfig(ctx, id, c); err != nil {
		t.Fatal(err)
	}
	visit("203.0.113.50:1000")
	if n := stored(); n != 2 {
		t.Fatalf("with the filter off %d visits are stored, want 2", n)
	}
}
