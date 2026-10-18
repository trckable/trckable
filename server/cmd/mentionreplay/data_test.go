package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func fingerprint(t *testing.T, dir string) map[string][32]byte {
	t.Helper()
	out := map[string][32]byte{}
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		b, err := os.ReadFile(p) //nolint:gosec // the test's own temp directory
		out[p] = sha256.Sum256(b)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestDataReplayListsHitsWithVisitsAndChangesNothing(t *testing.T) {
	dir := t.TempDir()
	day := time.Date(2026, 10, 10, 0, 0, 0, 0, time.UTC)
	seed(t, dir, day)
	before := fingerprint(t, dir)

	out := t.TempDir()
	opt := dataOptions{Dir: dir, Days: 30, Until: day.AddDate(0, 0, 3), CSV: filepath.Join(out, "r.csv"), MD: filepath.Join(out, "r.md")}
	var errOut bytes.Buffer
	if err := runData(context.Background(), opt, &errOut); err != nil {
		t.Fatal(err)
	}
	csv, _ := os.ReadFile(opt.CSV)
	got := string(csv)
	if !strings.Contains(got, "acme.example,2026-10-10,hn,Show HN: I built acme.example,https://news.ycombinator.com/item?id=1,hit,domain,acme.example,5,3") {
		t.Fatalf("the Hacker News hit with its visits:\n%s", got)
	}
	if !strings.Contains(got, ",hit,domain,acme.example,5,0") {
		t.Fatalf("the second hit, no visits from its host:\n%s", got)
	}
	if strings.Contains(got, "recipe") || strings.Contains(got, "Old news") {
		t.Fatalf("a refused item and one outside the window are not listed:\n%s", got)
	}
	md, _ := os.ReadFile(opt.MD)
	if !strings.Contains(string(md), "| acme.example | 2026-10-10 | hn | hit | domain |") {
		t.Fatalf("markdown:\n%s", md)
	}
	if !strings.Contains(errOut.String(), "2 rows, 2 hits") {
		t.Fatalf("summary: %q", errOut.String())
	}

	opt.All, opt.CSV = true, filepath.Join(out, "all.csv")
	if err := runData(context.Background(), opt, &errOut); err != nil {
		t.Fatal(err)
	}
	all, _ := os.ReadFile(opt.CSV)
	if !strings.Contains(string(all), ",refused,") {
		t.Fatalf("-all lists the refusals:\n%s", all)
	}

	after := fingerprint(t, dir)
	if len(after) != len(before) {
		t.Fatalf("files appeared or went: %v -> %v", before, after)
	}
	for p, h := range before {
		if after[p] != h {
			t.Fatalf("%s changed", p)
		}
	}
}

func TestDataIsOpenedReadOnly(t *testing.T) {
	dir := t.TempDir()
	seed(t, dir, time.Date(2026, 10, 10, 0, 0, 0, 0, time.UTC))
	lite, duck, err := openReadOnly(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer lite.Close()
	defer duck.Close()
	ctx := context.Background()
	for name, w := range map[string]struct {
		db *sql.DB
		q  string
	}{
		"sqlite": {lite, `DELETE FROM mentions`},
		"duckdb": {duck, `DELETE FROM events`},
	} {
		if _, err := w.db.ExecContext(ctx, w.q); err == nil {
			t.Errorf("%s accepted a write", name)
		}
	}
	var n int
	if err := lite.QueryRowContext(ctx, `SELECT count(*) FROM mentions`).Scan(&n); err != nil || n != 4 {
		t.Fatalf("still 4 mentions: %d %v", n, err)
	}
}

func TestDataNeedsADatabase(t *testing.T) {
	err := runData(context.Background(), dataOptions{Dir: t.TempDir(), Days: 30, Until: time.Now(), CSV: filepath.Join(t.TempDir(), "x.csv")}, &bytes.Buffer{})
	if err == nil || !strings.Contains(err.Error(), "no trckable.db") {
		t.Fatalf("%v", err)
	}
}
