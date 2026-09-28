package upgrade

import (
	"bufio"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/backup"
	"github.com/trckable/trckable/server/internal/store/duck"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// TestMain doubles as another process holding the analytics store, the way a
// running server does: DuckDB lets one process open a file twice.
func TestMain(m *testing.M) {
	if path := os.Getenv("UPGRADE_TEST_HOLD"); path != "" {
		st, err := duck.OpenUnmigrated(path, duck.Options{})
		if err != nil {
			os.Exit(3)
		}
		if _, err := os.Stdout.WriteString("held\n"); err != nil {
			os.Exit(4)
		}
		_, _ = io.Copy(io.Discard, os.Stdin) // until the test lets go; it ends on EOF or error alike
		st.DB.Close()
		os.Exit(0)
	}
	os.Exit(m.Run())
}

// hold keeps the analytics store open in another process until release.
func hold(t *testing.T, dir string) (release func()) {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=^$") //nolint:gosec // runs this test binary itself
	cmd.Env = append(os.Environ(), "UPGRADE_TEST_HOLD="+filepath.Join(dir, "trckable.duckdb"))
	in, _ := cmd.StdinPipe()
	out, _ := cmd.StdoutPipe()
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	if line, _ := bufio.NewReader(out).ReadString('\n'); line != "held\n" {
		t.Fatalf("the holder did not open the store: %q", line)
	}
	return func() {
		in.Close()
		if err := cmd.Wait(); err != nil {
			t.Errorf("the holder: %v", err)
		}
	}
}

var testKey = []byte("0123456789abcdef0123456789abcdef")

// olderDir writes a data directory the way a release that stopped at control
// schema sq and analytics schema dk left it, with one site and one event.
func olderDir(t *testing.T, sq, dk int) string {
	t.Helper()
	ctx := context.Background()
	dir := t.TempDir()
	ctl, err := sqlite.OpenUnmigrated(filepath.Join(dir, "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	if err := ctl.MigrateTo(ctx, sq); err != nil {
		t.Fatal(err)
	}
	if _, err := ctl.DB.Exec(`INSERT INTO sites (id, account_id, domain, name, created_at) VALUES ('s1', ?, 'a.com', 'a', 0)`, sqlite.DefaultAccount); err != nil {
		t.Fatal(err)
	}
	ctl.Close()
	if dk > 0 {
		st, err := duck.OpenUnmigrated(filepath.Join(dir, "trckable.duckdb"), duck.Options{})
		if err != nil {
			t.Fatal(err)
		}
		if err := st.MigrateTo(ctx, dk); err != nil {
			t.Fatal(err)
		}
		if _, err := st.DB.Exec(`INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id) VALUES (1, 's1', now(), 1, 7, 7)`); err != nil {
			t.Fatal(err)
		}
		if err := st.Close(); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func options(dir string) Options {
	return Options{
		DataDir:  dir,
		DuckPath: filepath.Join(dir, "trckable.duckdb"),
		Version:  "9.9.9",
		Key:      func() ([]byte, error) { return testKey, nil },
	}
}

func run(t *testing.T, dir string, o Options) (Result, error) {
	t.Helper()
	ctl, err := sqlite.OpenUnmigrated(filepath.Join(dir, "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer ctl.Close()
	return Run(context.Background(), ctl, o)
}

func schemas(t *testing.T, dir string) (sq, dk int) {
	t.Helper()
	ctx := context.Background()
	ctl, err := sqlite.OpenUnmigrated(filepath.Join(dir, "trckable.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer ctl.Close()
	sq, _, _ = ctl.Schema(ctx)
	st, err := duck.OpenUnmigrated(filepath.Join(dir, "trckable.duckdb"), duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	dk, _, _ = st.Schema(ctx)
	return sq, dk
}

func copies(t *testing.T, dir string) []string {
	t.Helper()
	entries, _ := os.ReadDir(Dir(dir))
	var out []string
	for _, e := range entries {
		out = append(out, e.Name())
	}
	return out
}

// An upgrade keeps a copy of the data as it was, named for the version it
// came from, before any migration runs; the copy restores to the old schema.
func TestUpgradeKeepsCopyFirst(t *testing.T) {
	ctx := context.Background()
	sqWant, dkWant := migrationsOf(t)
	dir := olderDir(t, 29, dkWant-1)
	res, err := run(t, dir, options(dir))
	if err != nil {
		t.Fatal(err)
	}
	if res.SQLiteFrom != 29 || res.SQLiteTo != sqWant || res.DuckFrom != dkWant-1 || res.DuckTo != dkWant {
		t.Fatalf("result %+v", res)
	}
	if sq, dk := schemas(t, dir); sq != sqWant || dk != dkWant {
		t.Fatalf("after: sqlite %d duck %d", sq, dk)
	}
	if got := copies(t, dir); len(got) != 1 || !strings.HasPrefix(got[0], "trckable-0.2.0-") || filepath.Join(Dir(dir), got[0]) != res.Backup {
		t.Fatalf("copies %v, result %q", got, res.Backup)
	}

	// The copy is the data before the upgrade.
	out := t.TempDir()
	if err := backup.Restore(res.Backup, out, testKey); err != nil {
		t.Fatal(err)
	}
	old, err := sqlite.OpenUnmigrated(filepath.Join(out, "control.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer old.Close()
	var sites int
	if err := old.DB.QueryRow(`SELECT count(*) FROM sites`).Scan(&sites); err != nil {
		t.Fatal(err)
	}
	if v, _, _ := old.Schema(ctx); v != 29 || sites != 1 {
		t.Fatalf("the copy is at schema %d with %d sites, want 29 and 1", v, sites)
	}
	if _, err := os.Stat(filepath.Join(out, "analytics", "events.parquet")); err != nil {
		t.Fatalf("the copy has no analytics: %v", err)
	}

	// The next start is a normal one: nothing copied, nothing migrated.
	again, err := run(t, dir, options(dir))
	if err != nil || again.Upgraded() || again.Backup != "" {
		t.Fatalf("second start: %+v %v", again, err)
	}
	if got := copies(t, dir); len(got) != 1 {
		t.Fatalf("copies after a normal start: %v", got)
	}
}

// A normal start does not open the analytics store: it may be held by the
// server's own writer, and opening it would cost the boot.
func TestNormalStartLeavesAnalyticsAlone(t *testing.T) {
	_, dkWant := migrationsOf(t)
	dir := olderDir(t, 29, dkWant)
	if _, err := run(t, dir, options(dir)); err != nil {
		t.Fatal(err)
	}
	release := hold(t, dir)
	defer release()
	res, err := run(t, dir, options(dir))
	if err != nil || res.Upgraded() {
		t.Fatalf("normal start next to a held store: %+v %v", res, err)
	}
}

// Only an analytics store behind is enough for a copy.
func TestAnalyticsOnlyUpgrade(t *testing.T) {
	sqWant, dkWant := migrationsOf(t)
	dir := olderDir(t, sqWant, dkWant-1)
	res, err := run(t, dir, options(dir))
	if err != nil {
		t.Fatal(err)
	}
	if res.Backup == "" || res.DuckFrom != dkWant-1 || res.DuckTo != dkWant {
		t.Fatalf("result %+v", res)
	}
}

// A new instance has nothing to keep.
func TestNewInstanceNoCopy(t *testing.T) {
	dir := t.TempDir()
	res, err := run(t, dir, options(dir))
	if err != nil || res.Backup != "" {
		t.Fatalf("%+v %v", res, err)
	}
	if _, err := os.Stat(Dir(dir)); !os.IsNotExist(err) {
		t.Fatalf("a new instance made %s", Dir(dir))
	}
}

// When no copy can be made, nothing is migrated.
func TestNoCopyNoMigration(t *testing.T) {
	_, dkWant := migrationsOf(t)
	for name, break_ := range map[string]func(t *testing.T, dir string, o *Options){
		"no key": func(_ *testing.T, _ string, o *Options) {
			o.Key = func() ([]byte, error) { return nil, errors.New("no key") }
		},
		"backups cannot be written": func(t *testing.T, dir string, _ *Options) {
			if err := os.WriteFile(filepath.Join(dir, "backups"), nil, 0o600); err != nil { // a file where the folder goes
				t.Fatal(err)
			}
		},
		"not enough space": func(*testing.T, string, *Options) {
			freeSpace = func(string) (int64, error) { return 1 << 20, nil }
		},
	} {
		t.Run(name, func(t *testing.T) {
			defer func(f func(string) (int64, error)) { freeSpace = f }(freeSpace)
			dir := olderDir(t, 29, dkWant-1)
			o := options(dir)
			break_(t, dir, &o)
			if _, err := run(t, dir, o); err == nil || !strings.Contains(err.Error(), "nothing was changed") {
				t.Fatalf("got %v, want a refusal that says nothing was changed", err)
			}
			if sq, dk := schemas(t, dir); sq != 29 || dk != dkWant-1 {
				t.Fatalf("migrated without a copy: sqlite %d duck %d", sq, dk)
			}
		})
	}
}

// An upgrade that needs the analytics store while another process holds it
// refuses, and migrates nothing.
func TestHeldAnalyticsRefuses(t *testing.T) {
	_, dkWant := migrationsOf(t)
	dir := olderDir(t, 29, dkWant)
	release := hold(t, dir)
	_, err := run(t, dir, options(dir))
	release()
	if err == nil || !strings.Contains(err.Error(), "another process holds it") {
		t.Fatalf("got %v", err)
	}
	if sq, _ := schemas(t, dir); sq != 29 {
		t.Fatalf("migrated to %d while the store was held", sq)
	}
}

// The next upgrade's copy replaces the last one; the nightly backups beside
// it are not touched.
func TestCopyReplacesTheLastOne(t *testing.T) {
	_, dkWant := migrationsOf(t)
	dir := olderDir(t, 29, dkWant)
	if err := os.MkdirAll(Dir(dir), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(Dir(dir), "trckable-0.1.2-20260101-000000.tkb"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	nightly := filepath.Join(dir, "backups", "trckable-20260101-000000.tkb")
	if err := os.WriteFile(nightly, []byte("nightly"), 0o600); err != nil {
		t.Fatal(err)
	}
	res, err := run(t, dir, options(dir))
	if err != nil {
		t.Fatal(err)
	}
	if got := copies(t, dir); len(got) != 1 || filepath.Join(Dir(dir), got[0]) != res.Backup {
		t.Fatalf("copies %v", got)
	}
	if _, err := os.Stat(nightly); err != nil {
		t.Fatalf("the nightly backup went: %v", err)
	}
}

// The version recorded on the last start names the copy; releases from
// before it was recorded are known by their schema.
func TestFromVersion(t *testing.T) {
	for _, c := range []struct {
		rec  string
		sq   int
		want string
	}{{"0.3.0", 29, "0.3.0"}, {"", 29, "0.2.0"}, {"", 22, "0.1.2"}, {"", 21, "0.1.1"}, {"", 25, "schema-25"}} {
		if got := fromVersion(c.rec, c.sq); got != c.want {
			t.Errorf("fromVersion(%q, %d) = %q, want %q", c.rec, c.sq, got, c.want)
		}
	}
}

func migrationsOf(t *testing.T) (sq, dk int) {
	t.Helper()
	ctl, err := sqlite.OpenUnmigrated(filepath.Join(t.TempDir(), "x.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer ctl.Close()
	_, sq, _ = ctl.Schema(context.Background())
	if sq < 30 {
		t.Fatalf("control schema %d: these tests start from 29", sq)
	}
	return sq, duck.Migrations()
}
