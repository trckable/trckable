package backup

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"sort"
	"strings"
	"time"
)

// Remote is an S3-compatible bucket that backups are copied to: Hetzner,
// Backblaze B2, Cloudflare R2, Scaleway, MinIO, AWS. A backup that only lives
// on the machine it protects is lost with that machine.
//
// It speaks just enough S3 for the job — put, list, delete — signed with
// SigV4 by hand, so trckable carries no SDK for three requests.
type Remote struct {
	Endpoint  *url.URL // https://s3.eu-central-003.backblazeb2.com
	Bucket    string
	Prefix    string // "trckable/" — may be empty
	Region    string // "auto" for R2, the bucket's region elsewhere
	AccessKey string
	SecretKey string
	Virtual   bool // bucket.host addressing instead of host/bucket
	Client    *http.Client
}

// MaxUpload is the largest object one PUT may carry on S3 and on every store
// that copies it. A backup above it needs a multipart upload, which trckable
// does not do yet, and the error says so rather than failing half way.
const MaxUpload = 5 << 30

// ParseRemote reads TRCKABLE_BACKUP_S3:
//
//	https://ACCESS_KEY:SECRET_KEY@host/bucket/optional/prefix?region=eu-central-1
//
// Add style=virtual for stores that want the bucket in the host name.
func ParseRemote(raw string) (*Remote, error) {
	if raw == "" {
		return nil, nil
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("TRCKABLE_BACKUP_S3 is not a URL")
	}
	if u.Scheme != "https" && !(u.Scheme == "http" && isLocal(u.Hostname())) {
		// The keys travel in every request's signature, and the backup in its
		// body: plain http is for a MinIO on the same machine only.
		return nil, fmt.Errorf("TRCKABLE_BACKUP_S3 must be https (http only for localhost)")
	}
	secret, _ := u.User.Password()
	r := &Remote{
		Endpoint:  &url.URL{Scheme: u.Scheme, Host: u.Host},
		AccessKey: u.User.Username(),
		SecretKey: secret,
		Region:    u.Query().Get("region"),
		Virtual:   u.Query().Get("style") == "virtual",
		Client:    &http.Client{Timeout: 30 * time.Minute},
	}
	parts := strings.SplitN(strings.Trim(u.Path, "/"), "/", 2)
	r.Bucket = parts[0]
	if len(parts) == 2 && parts[1] != "" {
		r.Prefix = strings.TrimSuffix(parts[1], "/") + "/"
	}
	if r.Region == "" {
		r.Region = "us-east-1" // what most S3-compatible stores accept when they ignore it
	}
	switch {
	case r.Bucket == "":
		return nil, fmt.Errorf("TRCKABLE_BACKUP_S3 needs a bucket: https://key:secret@host/bucket")
	case r.AccessKey == "" || r.SecretKey == "":
		return nil, fmt.Errorf("TRCKABLE_BACKUP_S3 needs an access key and a secret: https://key:secret@host/bucket")
	}
	return r, nil
}

func isLocal(host string) bool {
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

// Where says where backups go, without the keys.
func (r *Remote) Where() string {
	return r.Endpoint.Host + "/" + r.Bucket + "/" + r.Prefix
}

// Upload copies one backup file into the bucket under its own name.
func (r *Remote) Upload(ctx context.Context, file string) error {
	f, err := os.Open(file)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	if info.Size() > MaxUpload {
		return fmt.Errorf("backup is %.1f GB, above the 5 GB a single upload may carry", float64(info.Size())/(1<<30))
	}
	// SigV4 signs the body's hash, so the file is read twice: once to hash
	// it, once to send it. Cheap next to the upload itself.
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return err
	}
	req, err := r.request(ctx, http.MethodPut, r.Prefix+path.Base(file), nil, io.NopCloser(f), hex.EncodeToString(h.Sum(nil)))
	if err != nil {
		return err
	}
	req.ContentLength = info.Size()
	req.Header.Set("Content-Type", "application/octet-stream")
	_, err = r.do(req)
	return err
}

// List returns the backups in the bucket, newest first.
func (r *Remote) List(ctx context.Context) ([]string, error) {
	var names []string
	token := ""
	for {
		q := url.Values{"list-type": {"2"}, "prefix": {r.Prefix}}
		if token != "" {
			q.Set("continuation-token", token)
		}
		req, err := r.request(ctx, http.MethodGet, "", q, nil, emptyHash)
		if err != nil {
			return nil, err
		}
		body, err := r.do(req)
		if err != nil {
			return nil, err
		}
		var page struct {
			Contents []struct {
				Key string `xml:"Key"`
			} `xml:"Contents"`
			Truncated bool   `xml:"IsTruncated"`
			Next      string `xml:"NextContinuationToken"`
		}
		if err := xml.Unmarshal(body, &page); err != nil {
			return nil, fmt.Errorf("the bucket's listing is not S3 XML: %w", err)
		}
		for _, c := range page.Contents {
			if name := strings.TrimPrefix(c.Key, r.Prefix); strings.HasSuffix(name, ".tkb") && !strings.Contains(name, "/") {
				names = append(names, name)
			}
		}
		if !page.Truncated || page.Next == "" {
			break
		}
		token = page.Next
	}
	SortNewest(names)
	return names, nil
}

// Prune deletes remote backups older than keep, but never the newest one:
// a server that stopped writing backups must not delete its last.
func (r *Remote) Prune(ctx context.Context, keep time.Duration, now time.Time) (int, error) {
	names, err := r.List(ctx)
	if err != nil {
		return 0, err
	}
	removed := 0
	for i, name := range names {
		at, ok := backupTime(name)
		if i == 0 || !ok || now.Sub(at) <= keep {
			continue
		}
		req, err := r.request(ctx, http.MethodDelete, r.Prefix+name, nil, nil, emptyHash)
		if err != nil {
			return removed, err
		}
		if _, err := r.do(req); err != nil {
			return removed, err
		}
		removed++
	}
	return removed, nil
}

// backupTime reads the time out of "trckable-20260923-031500.tkb".
func backupTime(name string) (time.Time, bool) {
	s := strings.TrimSuffix(name, ".tkb")
	if i := strings.LastIndexByte(s, '-'); i > 8 {
		s = s[i-8:]
	}
	t, err := time.Parse("20060102-150405", s)
	return t, err == nil
}

const emptyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

// request builds a SigV4-signed request for key (empty for the bucket).
func (r *Remote) request(ctx context.Context, method, key string, q url.Values, body io.ReadCloser, payloadHash string) (*http.Request, error) {
	u := *r.Endpoint
	if r.Virtual {
		u.Host = r.Bucket + "." + u.Host
		u.Path = "/" + key
	} else {
		u.Path = "/" + r.Bucket + "/" + key
		if key == "" {
			u.Path = "/" + r.Bucket
		}
	}
	u.RawPath = s3Escape(u.Path)
	u.RawQuery = canonicalQuery(q)
	req, err := http.NewRequestWithContext(ctx, method, u.String(), body)
	if err != nil {
		return nil, err
	}
	r.sign(req, payloadHash, time.Now().UTC())
	return req, nil
}

func (r *Remote) do(req *http.Request) ([]byte, error) {
	res, err := r.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if res.StatusCode/100 != 2 {
		var e struct {
			Code    string `xml:"Code"`
			Message string `xml:"Message"`
		}
		xml.Unmarshal(body, &e)
		if e.Code != "" {
			return nil, fmt.Errorf("%s %s: %s (%s)", req.Method, r.Where(), e.Code, e.Message)
		}
		return nil, fmt.Errorf("%s %s: %s", req.Method, r.Where(), res.Status)
	}
	return body, nil
}

// sign adds AWS Signature Version 4 to req.
func (r *Remote) sign(req *http.Request, payloadHash string, now time.Time) {
	stamp := now.Format("20060102T150405Z")
	day := stamp[:8]
	req.Header.Set("Host", req.URL.Host)
	req.Header.Set("X-Amz-Date", stamp)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)

	names := []string{"host", "x-amz-content-sha256", "x-amz-date"}
	var headers strings.Builder
	for _, n := range names {
		v := req.Header.Get(n)
		if n == "host" {
			v = req.URL.Host
		}
		headers.WriteString(n + ":" + strings.TrimSpace(v) + "\n")
	}
	signed := strings.Join(names, ";")
	canonical := strings.Join([]string{req.Method, req.URL.EscapedPath(), req.URL.RawQuery, headers.String(), signed, payloadHash}, "\n")

	scope := day + "/" + r.Region + "/s3/aws4_request"
	sum := sha256.Sum256([]byte(canonical))
	toSign := "AWS4-HMAC-SHA256\n" + stamp + "\n" + scope + "\n" + hex.EncodeToString(sum[:])

	key := hmacSHA([]byte("AWS4"+r.SecretKey), day)
	for _, part := range []string{r.Region, "s3", "aws4_request"} {
		key = hmacSHA(key, part)
	}
	sig := hex.EncodeToString(hmacSHA(key, toSign))
	req.Header.Set("Authorization", "AWS4-HMAC-SHA256 Credential="+r.AccessKey+"/"+scope+", SignedHeaders="+signed+", Signature="+sig)
}

func hmacSHA(key []byte, s string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(s))
	return m.Sum(nil)
}

// s3Escape escapes a path the way SigV4 expects: every byte except
// unreserved characters and the slashes between segments.
func s3Escape(p string) string {
	var b strings.Builder
	for i := 0; i < len(p); i++ {
		c := p[i]
		if c == '/' || unreserved(c) {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

func unreserved(c byte) bool {
	return 'A' <= c && c <= 'Z' || 'a' <= c && c <= 'z' || '0' <= c && c <= '9' || c == '-' || c == '_' || c == '.' || c == '~'
}

// canonicalQuery sorts and escapes a query as SigV4 wants it.
func canonicalQuery(q url.Values) string {
	if len(q) == 0 {
		return ""
	}
	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var parts []string
	for _, k := range keys {
		for _, v := range q[k] {
			parts = append(parts, queryEscape(k)+"="+queryEscape(v))
		}
	}
	return strings.Join(parts, "&")
}

func queryEscape(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if c := s[i]; unreserved(c) {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

// SortNewest orders backup names newest first, by the time in the name, so
// files named under either name of the project sort together.
func SortNewest(names []string) {
	sort.SliceStable(names, func(i, j int) bool {
		a, _ := backupTime(names[i])
		b, _ := backupTime(names[j])
		return a.After(b)
	})
}
