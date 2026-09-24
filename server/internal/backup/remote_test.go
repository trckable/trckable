package backup

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
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
	r := &Remote{
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
		var b strings.Builder
		b.WriteString(`<ListBucketResult><IsTruncated>false</IsTruncated>`)
		for k := range f.objects {
			if strings.HasPrefix(k, r.URL.Query().Get("prefix")) {
				b.WriteString("<Contents><Key>" + k + "</Key></Contents>")
			}
		}
		b.WriteString(`</ListBucketResult>`)
		io.WriteString(w, b.String())
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
		os.WriteFile(name, []byte("backup"), 0o600)
		if err := r.Upload(context.Background(), name); err != nil {
			t.Fatal(err)
		}
	}
	fake.objects["tk/unrelated.txt"] = []byte("x")
	names, err := r.List(context.Background())
	if err != nil || len(names) != 4 || names[0] != "trckable-20260923-030000.tkb" {
		t.Fatalf("list: %v %v", names, err)
	}
	n, err := r.Prune(context.Background(), 30*24*time.Hour, now)
	if err != nil || n != 2 {
		t.Fatalf("pruned %d, %v", n, err)
	}
	if len(fake.objects) != 3 || string(fake.objects["tk/trckable-20260923-030000.tkb"]) != "backup" {
		t.Fatalf("left: %v", fake.objects)
	}
	// The newest backup is never pruned, however old it is.
	later := now.AddDate(1, 0, 0)
	if n, _ := r.Prune(context.Background(), 30*24*time.Hour, later); n != 1 {
		t.Fatalf("pruned %d a year later, want 1 (keeping the newest)", n)
	}
	if names, _ := r.List(context.Background()); len(names) != 1 {
		t.Fatalf("after a year: %v", names)
	}
}
