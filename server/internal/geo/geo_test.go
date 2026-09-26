package geo

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"sync/atomic"
	"testing"
	"time"
)

// TestLiveCountryDatabase downloads the real DB-IP country database and checks
// well-known addresses. Skipped with -short (CI without network).
func TestLiveCountryDatabase(t *testing.T) {
	if testing.Short() {
		t.Skip("network")
	}
	g := New(Country, t.TempDir())
	if err := g.refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	cases := map[string]string{
		"8.8.8.8":          "US",
		"2601:1c0:4c00::1": "US", // Comcast (single-country; anycast IPs like Google DNS vary)
		"79.106.125.62":    "AL", // the developer's own IP on the day this was written
		"192.168.1.1":      "",   // private: never resolved
	}
	for ip, want := range cases {
		if got := g.Lookup(ip).Country; got != want {
			t.Errorf("%s → %q, want %q", ip, got, want)
		}
	}
}

func TestBadDownloadNeverReplacesAGoodDatabase(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("not a gzip file"))
	}))
	defer srv.Close()
	g := New(Country, t.TempDir())
	g.URL = func(Mode, time.Time) string { return srv.URL }
	if err := g.refresh(context.Background()); err == nil {
		t.Fatal("expected an error for a corrupt download")
	}
	if g.Ready() {
		t.Fatal("corrupt download must not be loaded")
	}
	entries, _ := os.ReadDir(g.dir)
	if len(entries) != 0 {
		t.Fatalf("temp files left behind: %v", entries)
	}
}

func TestLookupWithoutDatabaseIsEmpty(t *testing.T) {
	g := New(Country, t.TempDir())
	if loc := g.Lookup("8.8.8.8"); loc != (Location{}) {
		t.Fatalf("expected empty location, got %+v", loc)
	}
}

// TestASNLive downloads the real network database and checks a few known
// addresses. It needs the internet, so it only runs when asked:
//
//	TRCKABLE_LIVE=1 go test ./internal/geo -run ASNLive
func TestASNLive(t *testing.T) {
	if os.Getenv("TRCKABLE_LIVE") == "" {
		t.Skip("set TRCKABLE_LIVE=1 to download the real database")
	}
	g := New(ASN, t.TempDir())
	if err := g.refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	for ip, want := range map[string]uint32{"8.8.8.8": 15169, "1.1.1.1": 13335} {
		if got := g.ASN(ip); got != want {
			t.Errorf("%s: AS%d, want AS%d", ip, got, want)
		}
	}
	// An Amazon Web Services address (their published range for EC2).
	if got := g.ASN("3.80.0.1"); got != 14618 && got != 16509 {
		t.Errorf("3.80.0.1: AS%d, want an Amazon network", got)
	}
	if g.ASN("10.0.0.1") != 0 || g.ASN("nonsense") != 0 {
		t.Error("private or invalid addresses must have no network")
	}
}

// A shared directory belongs to whoever keeps it fresh: an instance reading it
// never downloads, however old or missing the file is.
func TestSharedNeverDownloads(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits.Add(1) }))
	defer srv.Close()
	g := New(Country, t.TempDir())
	g.Shared = true
	g.URL = func(Mode, time.Time) string { return srv.URL }
	followEvery = 10 * time.Millisecond
	defer func() { followEvery = 10 * time.Minute }()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Millisecond)
	defer cancel()
	g.Run(ctx)
	if n := hits.Load(); n != 0 {
		t.Fatalf("a shared database downloaded %d times", n)
	}
}

// One instance follows a file another process replaces. Needs the network.
func TestSharedPicksUpANewerFile(t *testing.T) {
	if testing.Short() {
		t.Skip("network")
	}
	dir := t.TempDir()
	if err := New(Country, dir).Update(context.Background()); err != nil {
		t.Fatal(err)
	}
	g := New(Country, dir)
	g.Shared = true
	followEvery = 10 * time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { g.Run(ctx); close(done) }()
	// Run reads followEvery: it is put back only once Run has returned.
	defer func() { cancel(); <-done; followEvery = 10 * time.Minute }()
	deadline := time.Now().Add(2 * time.Second)
	for !g.Ready() && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if g.Lookup("8.8.8.8").Country != "US" {
		t.Fatal("shared database not loaded")
	}
	first := g.loaded.Load()
	later := time.Now().Add(time.Hour)
	os.Chtimes(g.path(), later, later) // what a fresh download looks like
	for g.loaded.Load() == first && time.Now().Before(deadline.Add(2*time.Second)) {
		time.Sleep(5 * time.Millisecond)
	}
	if g.loaded.Load() == first {
		t.Fatal("a replaced file was not picked up")
	}
}
