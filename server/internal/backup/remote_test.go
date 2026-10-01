package backup

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

// The two examples in AWS's SigV4 documentation that sign exactly the three
// headers trckable sends ("Signature Calculations for the Authorization
// Header", Amazon S3 API reference). If these match, the signing is right
// and not merely consistent with itself.
func TestSigV4MatchesAWSExamples(t *testing.T) {
	r := &Remote{ //nolint:gosec // AWS's published example keys, not credentials
		Endpoint: &url.URL{Scheme: "https", Host: "s3.amazonaws.com"}, Bucket: "examplebucket",
		Region: "us-east-1", AccessKey: "AKIAIOSFODNN7EXAMPLE",
		SecretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", Virtual: true,
	}
	at := time.Date(2013, 5, 24, 0, 0, 0, 0, time.UTC)
	for name, c := range map[string]struct {
		q    url.Values
		want string
	}{
		"GET bucket lifecycle": {url.Values{"lifecycle": {""}}, "fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543"},
		"GET bucket list":      {url.Values{"max-keys": {"2"}, "prefix": {"J"}}, "34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7"},
	} {
		req, err := r.request(context.Background(), http.MethodGet, "", c.q, nil, emptyHash)
		if err != nil {
			t.Fatal(err)
		}
		r.sign(req, emptyHash, at)
		if got := req.Header.Get("Authorization"); !strings.HasSuffix(got, "Signature="+c.want) {
			t.Errorf("%s: %s", name, got)
		}
	}
}

func TestParseRemote(t *testing.T) {
	r, err := ParseRemote("https://KEY:SEC%2Fret@s3.eu-central-003.backblazeb2.com/my-bucket/trckable/prod?region=eu-central-003")
	if err != nil {
		t.Fatal(err)
	}
	if r.Bucket != "my-bucket" || r.Prefix != "trckable/prod/" || r.Region != "eu-central-003" || r.SecretKey != "SEC/ret" || r.Virtual {
		t.Fatalf("%+v", r)
	}
	if r.Where() != "s3.eu-central-003.backblazeb2.com/my-bucket/trckable/prod/" || strings.Contains(r.Where(), "SEC") {
		t.Fatalf("where: %s", r.Where())
	}
	for _, bad := range []string{"http://k:s@example.com/b", "https://example.com/b", "https://k:s@example.com/"} {
		if _, err := ParseRemote(bad); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
	if r, err := ParseRemote(""); r != nil || err != nil {
		t.Fatal("empty should mean off")
	}
}

// fakeS3 is enough of a bucket to upload to, list and prune.
type fakeS3 struct {
	mu      sync.Mutex
	objects map[string][]byte
}

func (f *fakeS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !strings.HasPrefix(r.Header.Get("Authorization"), "AWS4-HMAC-SHA256 Credential=k/") {
		http.Error(w, "unsigned", http.StatusForbidden)
		return
	}
	key := strings.TrimPrefix(r.URL.Path, "/bucket/")
	switch r.Method {
	case http.MethodPut:
		b, _ := io.ReadAll(r.Body)
		f.objects[key] = b
	case http.MethodDelete:
		delete(f.objects, key)
		w.WriteHeader(http.StatusNoContent)
	case http.MethodGet:
		if key != "" && key != "tk" && key != "tk/" && r.URL.Query().Get("list-type") == "" {
			b, ok := f.objects[key]
			if !ok {
				w.WriteHeader(http.StatusNotFound)
				_, _ = io.WriteString(w, "<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>")
				return
			}
			_, _ = w.Write(b)
			return
		}
		var b strings.Builder
		b.WriteString(`<ListBucketResult><IsTruncated>false</IsTruncated>`)
		for k := range f.objects {
			if strings.HasPrefix(k, r.URL.Query().Get("prefix")) {
				b.WriteString("<Contents><Key>" + k + "</Key></Contents>")
			}
		}
		b.WriteString(`</ListBucketResult>`)
		_, _ = io.WriteString(w, b.String()) // a short reply fails the client's side of the test
	}
}

func TestRemoteUploadListPrune(t *testing.T) {
	fake := &fakeS3{objects: map[string][]byte{}}
	srv := httptest.NewServer(fake)
	defer srv.Close()
	r, err := ParseRemote(strings.Replace(srv.URL, "http://", "http://k:s@", 1) + "/bucket/tk")
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	now := time.Date(2026, 9, 23, 3, 0, 0, 0, time.UTC)
	for _, age := range []int{0, 10, 40, 41} {
		name := filepath.Join(dir, "trckable-"+now.AddDate(0, 0, -age).Format("20060102-150405")+".tkb")
		if err := os.WriteFile(name, []byte("backup"), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := r.Upload(context.Background(), name); err != nil {
			t.Fatal(err)
		}
	}
	fake.objects["tk/unrelated.txt"] = []byte("x")
	names, err := r.List(context.Background())
	if err != nil || len(names) != 4 || names[0] != "trckable-20260923-030000.tkb" {
		t.Fatalf("list: %v %v", names, err)
	}
	n, err := r.Prune(context.Background(), 30*24*time.Hour, now, "trckable-20260923-030000.tkb")
	if err != nil || n != 2 {
		t.Fatalf("pruned %d, %v", n, err)
	}
	if len(fake.objects) != 3 || string(fake.objects["tk/trckable-20260923-030000.tkb"]) != "backup" {
		t.Fatalf("left: %v", fake.objects)
	}
	// The newest backup is never pruned, however old it is.
	later := now.AddDate(1, 0, 0)
	if n, _ := r.Prune(context.Background(), 30*24*time.Hour, later, ""); n != 1 {
		t.Fatalf("pruned %d a year later, want 1 (keeping the newest)", n)
	}
	if names, _ := r.List(context.Background()); len(names) != 1 {
		t.Fatalf("after a year: %v", names)
	}
}

func TestRemoteDownload(t *testing.T) {
	fake := &fakeS3{objects: map[string][]byte{"tk/trckable-20260923-030000.tkb": []byte("backup bytes")}}
	srv := httptest.NewServer(fake)
	defer srv.Close()
	r, err := ParseRemote(strings.Replace(srv.URL, "http://", "http://k:s@", 1) + "/bucket/tk")
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	got, err := r.Download(context.Background(), "trckable-20260923-030000.tkb", dir)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(got) //nolint:gosec // a file this test wrote under t.TempDir
	if string(b) != "backup bytes" || filepath.Dir(got) != dir {
		t.Fatalf("downloaded %q to %s", b, got)
	}
	// A second copy into the same place is refused, never overwritten.
	if _, err := r.Download(context.Background(), "trckable-20260923-030000.tkb", dir); err == nil {
		t.Fatal("overwrote an existing file")
	}
	if _, err := r.Download(context.Background(), "trckable-20990101-000000.tkb", t.TempDir()); err == nil || !strings.Contains(err.Error(), "NoSuchKey") {
		t.Fatalf("a missing backup: %v", err)
	}
	for _, bad := range []string{"", "../secret.key", "a/b.tkb", "notes.txt"} {
		if _, err := r.Download(context.Background(), bad, dir); err == nil {
			t.Fatalf("took %q as a backup name", bad)
		}
	}
}

// Thin keeps every copy of the last seven days, the newest copy of each UTC
// day after that up to the keep limit, and the newest copy always.
func TestThin(t *testing.T) {
	now := time.Date(2026, 9, 23, 12, 0, 0, 0, time.UTC)
	const day = 24 * time.Hour
	name := func(at time.Time) string { return "trckable-" + at.Format("20060102-150405") + ".tkb" }
	ago := func(d time.Duration) string { return name(now.Add(-d)) }
	for _, c := range []struct {
		what  string
		names []string
		keep  time.Duration
		gone  []string
	}{
		{"an empty list", nil, 30 * day, nil},
		{"the last seven days are all kept", []string{ago(0), ago(2 * time.Hour), ago(day), ago(day + time.Hour), ago(6 * day)}, 30 * day, nil},
		{"one copy a day after seven days", []string{ago(0), ago(8 * day), ago(8*day + time.Hour), ago(8*day + 2*time.Hour), ago(9 * day), ago(9*day + time.Hour)}, 30 * day,
			[]string{ago(8*day + time.Hour), ago(8*day + 2*time.Hour), ago(9*day + time.Hour)}},
		{"the newest of a UTC day, not the first listed", []string{ago(0), name(time.Date(2026, 9, 10, 1, 0, 0, 0, time.UTC)), name(time.Date(2026, 9, 10, 23, 0, 0, 0, time.UTC)), name(time.Date(2026, 9, 10, 9, 0, 0, 0, time.UTC))}, 30 * day,
			[]string{name(time.Date(2026, 9, 10, 1, 0, 0, 0, time.UTC)), name(time.Date(2026, 9, 10, 9, 0, 0, 0, time.UTC))}},
		{"beyond the keep limit they go", []string{ago(0), ago(20 * day), ago(31 * day), ago(90 * day)}, 30 * day, []string{ago(31 * day), ago(90 * day)}},
		{"a keep limit under seven days wins", []string{ago(0), ago(2 * day), ago(5 * day)}, 3 * day, []string{ago(5 * day)}},
		{"the newest is never deleted", []string{ago(400 * day), ago(500 * day)}, 30 * day, []string{ago(500 * day)}},
		{"the newest of a day in the window outlives older copies of that day", []string{ago(7*day - time.Hour), ago(7*day + time.Hour), ago(0)}, 30 * day, []string{ago(7*day + time.Hour)}},
		{"names without a time are left alone", []string{ago(0), "trckable-latest.tkb", "notes.tkb", "trckable-2026-09-01.tkb", ago(60 * day)}, 30 * day, []string{ago(60 * day)}},
		{"only names without a time", []string{"a.tkb", "b.tkb"}, 30 * day, nil},
	} {
		got := Thin(c.names, c.keep, now)
		sort.Strings(got)
		want := append([]string(nil), c.gone...)
		sort.Strings(want)
		if !slices.Equal(got, want) {
			t.Errorf("%s: deleted %v, want %v", c.what, got, want)
		}
	}
}

// A bucket that is thinned keeps its days and loses the rest, and a listing
// that cannot be trusted deletes nothing.
func TestRemotePruneThinsAndTrustsOnlyAWholeListing(t *testing.T) {
	now := time.Date(2026, 9, 23, 12, 0, 0, 0, time.UTC)
	fake := &fakeS3{objects: map[string][]byte{}}
	for _, at := range []time.Time{now, now.Add(-time.Hour), now.Add(-9 * 24 * time.Hour), now.Add(-9*24*time.Hour - time.Hour), now.Add(-10 * 24 * time.Hour)} {
		fake.objects["tk/trckable-"+at.Format("20060102-150405")+".tkb"] = []byte("b")
	}
	srv := httptest.NewServer(fake)
	defer srv.Close()
	r, err := ParseRemote(strings.Replace(srv.URL, "http://", "http://k:s@", 1) + "/bucket/tk")
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	fresh := "trckable-" + now.Format("20060102-150405") + ".tkb"
	if _, err := r.Prune(ctx, 30*24*time.Hour, now, "trckable-20990101-000000.tkb"); err == nil || len(fake.objects) != 5 {
		t.Fatalf("pruned a listing without the fresh copy: %v, %d left", err, len(fake.objects))
	}
	n, err := r.Prune(ctx, 30*24*time.Hour, now, fresh)
	if err != nil || n != 1 || len(fake.objects) != 4 {
		t.Fatalf("pruned %d, %v, %d left", n, err, len(fake.objects))
	}
	if _, ok := fake.objects["tk/trckable-20260913-110000.tkb"]; ok {
		t.Fatal("kept the older copy of a day")
	}

	// A listing that stops without saying where it goes on is half a listing.
	partial := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == http.MethodDelete {
			t.Error("deleted from a partial listing")
		}
		_, _ = io.WriteString(w, `<ListBucketResult><IsTruncated>true</IsTruncated><Contents><Key>tk/trckable-20240101-000000.tkb</Key></Contents></ListBucketResult>`)
	}))
	defer partial.Close()
	p, _ := ParseRemote(strings.Replace(partial.URL, "http://", "http://k:s@", 1) + "/bucket/tk")
	if n, err := p.Prune(ctx, 24*time.Hour, now, ""); err == nil || n != 0 {
		t.Fatalf("a partial listing: %d, %v", n, err)
	}
	// And one that fails outright.
	down := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == http.MethodDelete {
			t.Error("deleted after a failed listing")
		}
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer down.Close()
	d, _ := ParseRemote(strings.Replace(down.URL, "http://", "http://k:s@", 1) + "/bucket/tk")
	if n, err := d.Prune(ctx, 24*time.Hour, now, ""); err == nil || n != 0 {
		t.Fatalf("a failed listing: %d, %v", n, err)
	}
}
