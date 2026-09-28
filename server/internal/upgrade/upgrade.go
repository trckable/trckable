// Package upgrade brings a data directory written by an older trckable to
// this one's schema, and never without a way back: before the first pending
// migration of either store runs, it writes an encrypted backup of both (the
// same file the nightly backup writes, restorable with `trckabled restore`)
// and checks it. When that copy cannot be made, nothing is migrated and the
// caller refuses to start.
//
// The copy is named for the version it upgrades from and kept in
// backups/before-upgrade, out of the nightly rotation, until the next
// upgrade's copy replaces it.
package upgrade

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/trckable/trckable/server/internal/backup"
	"github.com/trckable/trckable/server/internal/store/duck"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Meta keys in the control database.
const (
	// DuckSchemaKey mirrors the analytics store's schema, so a normal start
	// knows there is nothing to upgrade without opening that store (which
	// the server opens in the background, after the listener is up).
	DuckSchemaKey = "duck_schema"
	// VersionKey is the version that last started on this data directory:
	// the name of the next upgrade's copy.
	VersionKey = "version"
)

// Dir is where the copy taken before a migration is kept.
func Dir(dataDir string) string { return filepath.Join(dataDir, "backups", "before-upgrade") }

// Options say where the stores are and how to reach the backup key.
type Options struct {
	DataDir  string
	DuckPath string
	Version  string // this binary's
	// Key returns the backup key. It is only asked for when a copy is made.
	Key func() ([]byte, error)
	// DuckWait is how long to wait for the analytics store while another
	// process still holds it (a server stopping during a redeploy). 0 tries
	// once: a command run next to a live server says so at once.
	DuckWait time.Duration
	Duck     duck.Options
	// Log is told what happens. Optional.
	Log func(msg string, args ...any)
}

// Result says what Run did.
type Result struct {
	SQLiteFrom, SQLiteTo int
	DuckFrom, DuckTo     int
	From                 string // the version the data came from
	Backup               string // the copy, when one was made
	BackupBytes          int64
	Took                 time.Duration // the copy, including its check
}

// Upgraded reports whether any migration ran.
func (r Result) Upgraded() bool { return r.SQLiteFrom != r.SQLiteTo || r.DuckFrom != r.DuckTo }

// freeSpace is what the volume holding dir has left; a variable for tests.
var freeSpace = func(dir string) (int64, error) {
	var st syscall.Statfs_t
	if err := syscall.Statfs(dir, &st); err != nil {
		return 0, err
	}
	return int64(st.Bavail) * int64(st.Bsize), nil
}

// headroom is what the volume must keep free on top of the copy's own room.
const headroom = 64 << 20

// Run upgrades both stores, the control database through ctl (opened with
// sqlite.OpenUnmigrated) and the analytics store at o.DuckPath. It leaves
// ctl open, migrated but for its site cache: callers go on with ctl.Migrate,
// which finds nothing left to do.
//
// A normal start reads two small values from the control database and
// returns. Only a data directory with something to migrate opens the
// analytics store here.
func Run(ctx context.Context, ctl *sqlite.Store, o Options) (res Result, err error) {
	logf := o.Log
	if logf == nil {
		logf = func(string, ...any) {}
	}
	sHave, sWant, err := ctl.Schema(ctx)
	if err != nil {
		return res, fmt.Errorf("read the control database's schema: %w", err)
	}
	res.SQLiteFrom, res.SQLiteTo = sHave, sHave
	if sHave > sWant {
		return res, nil // Migrate refuses it: the downgrade guard says why
	}
	var duckMeta, from string
	if sHave > 0 {
		if duckMeta, _, err = ctl.Meta(ctx, DuckSchemaKey); err != nil {
			return res, err
		}
		if from, _, err = ctl.Meta(ctx, VersionKey); err != nil {
			return res, err
		}
	}
	dWant := duck.Migrations()
	if sHave == sWant && duckMeta == strconv.Itoa(dWant) {
		// The fast path: every start of an instance already upgraded.
		if from != o.Version && o.Version != "" {
			if err := ctl.SetMeta(ctx, VersionKey, o.Version); err != nil {
				return res, err
			}
		}
		res.DuckFrom, res.DuckTo = dWant, dWant
		return res, nil
	}

	// Something may be pending: look at the analytics store too.
	var st *duck.Store
	dHave := 0
	if _, err := os.Stat(o.DuckPath); err == nil {
		if st, err = openDuck(ctx, o); err != nil {
			return res, err
		}
		defer func() {
			if cerr := st.Close(); cerr != nil && err == nil {
				err = fmt.Errorf("close the analytics store after upgrading it: %w", cerr)
			}
		}()
		if dHave, _, err = st.Schema(ctx); err != nil {
			return res, fmt.Errorf("read the analytics store's schema: %w", err)
		}
		if dHave > dWant {
			return res, fmt.Errorf("duckdb schema version %d is newer than this binary (%d): refusing to start (downgrade guard)", dHave, dWant)
		}
	}
	res.DuckFrom, res.DuckTo = dHave, dHave

	// A store at 0 holds nothing to lose; one behind this binary does.
	pending := (sHave > 0 && sHave < sWant) || (dHave > 0 && dHave < dWant)
	if pending {
		res.From = fromVersion(from, sHave)
		dTo := dHave
		if st != nil {
			dTo = dWant
		}
		logf("upgrading: keeping a copy of the data first",
			"from", res.From, "to", o.Version, "sqlite_from", sHave, "sqlite_to", sWant, "duck_from", dHave, "duck_to", dTo)
		if err := roomForCopy(o.DataDir, o.DuckPath); err != nil {
			return res, err
		}
		key, err := o.Key()
		if err != nil {
			return res, fmt.Errorf("no copy of the data could be made before upgrading, so nothing was changed: the backup key: %w", err)
		}
		bs := backup.Store{DataDir: o.DataDir, Ctl: ctl.DB, Key: key}
		if st != nil {
			bs.Duck = st.DB
		}
		path, n, took, err := keepCopy(ctx, bs, res.From)
		if err != nil {
			return res, fmt.Errorf("no copy of the data could be made before upgrading, so nothing was changed "+
				"(trckable starts once it can make one): %w", err)
		}
		res.Backup, res.BackupBytes, res.Took = path, n, took
		logf("copy kept before upgrading", "path", path, "bytes", n, "took", took.Round(time.Millisecond))
	}

	restore := ""
	if res.Backup != "" {
		restore = " — the data as it was is in " + res.Backup + " (trckabled restore <file> <empty dir>, then start the version it came from)"
	}
	if err := ctl.Migrate(ctx); err != nil {
		return res, fmt.Errorf("upgrade the control database: %w%s", err, restore)
	}
	res.SQLiteTo = sWant
	if st != nil {
		if err := st.Migrate(ctx); err != nil {
			return res, fmt.Errorf("upgrade the analytics store: %w%s", err, restore)
		}
		res.DuckTo = dWant
		if err := ctl.SetMeta(ctx, DuckSchemaKey, strconv.Itoa(dWant)); err != nil {
			return res, err
		}
	}
	if o.Version != "" {
		if err := ctl.SetMeta(ctx, VersionKey, o.Version); err != nil {
			return res, err
		}
	}
	if res.Upgraded() {
		logf("upgraded", "from", res.From, "to", o.Version, "sqlite_from", res.SQLiteFrom, "sqlite_to", res.SQLiteTo,
			"duck_from", res.DuckFrom, "duck_to", res.DuckTo, "backup", res.Backup)
	}
	return res, nil
}

// Remember records that the analytics store is at this binary's schema, once
// the server has opened it (a new instance creates it after Run).
func Remember(ctx context.Context, ctl *sqlite.Store) error {
	want := strconv.Itoa(duck.Migrations())
	if v, _, err := ctl.Meta(ctx, DuckSchemaKey); err != nil || v == want {
		return err
	}
	return ctl.SetMeta(ctx, DuckSchemaKey, want)
}

// Forget makes the next start look at the analytics store again: it was found
// behind the schema the control database said it had.
func Forget(ctx context.Context, ctl *sqlite.Store) error {
	return ctl.SetMeta(ctx, DuckSchemaKey, "")
}

// openDuck opens the analytics store without migrating it, waiting while a
// stopping instance still holds it.
func openDuck(ctx context.Context, o Options) (*duck.Store, error) {
	deadline := time.Now().Add(o.DuckWait)
	for {
		st, err := duck.OpenUnmigrated(o.DuckPath, o.Duck)
		if err == nil {
			return st, nil
		}
		if time.Now().After(deadline) || ctx.Err() != nil {
			return nil, fmt.Errorf("the analytics store needs looking at before this version starts, and another process holds it "+
				"(is trckabled already running on this data directory? stop it first): %w", err)
		}
		select {
		case <-time.After(500 * time.Millisecond):
		case <-ctx.Done():
		}
	}
}

// roomForCopy refuses when the volume cannot hold a copy of the data: a
// backup needs about twice the data while it is written (a plain copy of each
// store, then the compressed file), and the volume keeps some room after.
func roomForCopy(dataDir, duckPath string) error {
	size := fileSize(filepath.Join(dataDir, "trckable.db")) + fileSize(filepath.Join(dataDir, "trckable.db-wal")) +
		fileSize(duckPath) + fileSize(duckPath+".wal") + dirSize(filepath.Join(dataDir, "wal"))
	need := 2*size + headroom
	free, err := freeSpace(dataDir)
	if err != nil {
		return nil // unknown: the backup itself fails cleanly if the disk fills
	}
	if free < need {
		return fmt.Errorf("not enough disk space to keep a copy before upgrading, so nothing was changed: "+
			"the data takes %s, a copy needs about %s free, and the volume has %s. "+
			"Free some space or grow the volume, then start again", mb(size), mb(need), mb(free))
	}
	return nil
}

// keepCopy writes the backup, checks it, names it for the version it comes
// from, and then lets go of the copy an earlier upgrade kept.
func keepCopy(ctx context.Context, bs backup.Store, from string) (path string, n int64, took time.Duration, err error) {
	started := time.Now()
	dir := Dir(bs.DataDir)
	r, err := backup.Run(ctx, bs, dir)
	if err != nil {
		return "", 0, 0, err
	}
	// Checked as a restore checks it, before anything relies on it.
	if err := backup.Verify(r.Path, bs.Key); err != nil {
		os.Remove(r.Path)
		return "", 0, 0, fmt.Errorf("the copy did not read back: %w", err)
	}
	path = filepath.Join(dir, "trckable-"+from+"-"+strings.TrimPrefix(filepath.Base(r.Path), "trckable-"))
	if err := os.Rename(r.Path, path); err != nil {
		return "", 0, 0, err
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if p := filepath.Join(dir, e.Name()); p != path && !e.IsDir() && strings.HasSuffix(e.Name(), ".tkb") {
			os.Remove(p)
		}
	}
	return path, r.Bytes, time.Since(started), nil
}

// released names the control schemas of the releases from before the version
// was recorded in the data directory. 0.1.0 and 0.1.1 share one schema.
var released = map[int]string{21: "0.1.1", 22: "0.1.2", 29: "0.2.0"}

func fromVersion(recorded string, sqliteSchema int) string {
	if recorded != "" {
		return recorded
	}
	if v, ok := released[sqliteSchema]; ok {
		return v
	}
	return "schema-" + strconv.Itoa(sqliteSchema)
}

func fileSize(p string) int64 {
	info, err := os.Stat(p)
	if err != nil {
		return 0
	}
	return info.Size()
}

func dirSize(dir string) int64 {
	var total int64
	// The walk never stops early (every error is skipped below), so it has
	// nothing to return: a file it cannot read just counts as nothing.
	_ = filepath.Walk(dir, func(_ string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			total += info.Size()
		}
		return nil
	})
	return total
}

func mb(n int64) string { return fmt.Sprintf("%.0f MB", float64(n)/(1<<20)) }
