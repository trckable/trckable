package server

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// nonrootID is the user and group the published image runs as.
const nonrootID = 65532

// dataSubdirs are the folders inside the data directory that must be writable
// when they exist: a volume an older image filled as root can have the top
// folder handed over and these still root's.
var dataSubdirs = []string{"wal", "backups", "geo"}

// PrepareDataDir makes the data directory if it is missing and proves this
// process can write to it. The published image runs as an unprivileged user
// (65532), and a volume an older image filled as root is not writable by it:
// say so, and say what to run, instead of the first database error that
// happens to come up.
func PrepareDataDir(dir string) error {
	err := writableDir(dir)
	for _, sub := range dataSubdirs {
		if err != nil {
			break
		}
		err = writableSubdir(filepath.Join(dir, sub))
	}
	if err == nil {
		return nil
	}
	if errors.Is(err, fs.ErrPermission) {
		return errors.New(unwritableMessage(dir, os.Geteuid(), onRailway()))
	}
	return fmt.Errorf("data dir: %w", err)
}

func onRailway() bool {
	return os.Getenv("RAILWAY_ENVIRONMENT") != "" || os.Getenv("RAILWAY_PROJECT_ID") != ""
}

// unwritableMessage says what to do about a data directory this user cannot
// write: on Railway the volume is mounted as root and the platform has its
// own setting for that, elsewhere the owner of the folder is changed once.
func unwritableMessage(dir string, uid int, railway bool) string {
	head := fmt.Sprintf("data dir %s is not writable by this user (uid %d): the image runs as an unprivileged user, ", dir, uid)
	if railway {
		return head + "and Railway mounts its volume as root. Set RAILWAY_RUN_UID=0 on the service (a variable in its settings), then redeploy."
	}
	return head + fmt.Sprintf("so a volume or folder an older image (or Docker, for a bind mount) made as root needs its owner changed once. "+
		"Run: chown -R %d:%d %s (on the host, or in a one-off container as root), or start the container with --user set to the folder's owner",
		nonrootID, nonrootID, dir)
}

func writableDir(dir string) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	if err := probe(dir); err != nil {
		return err
	}
	// Files an older, root-running image left behind can be unwritable even
	// when the directory itself was handed over.
	for _, f := range privateFiles {
		if err := openWritable(filepath.Join(dir, f)); err != nil {
			return err
		}
	}
	return nil
}

// writableSubdir checks a folder inside the data directory, and the log
// segments in it, if it exists: a missing one is made by the server later.
func writableSubdir(dir string) error {
	entries, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if err := probe(dir); err != nil {
		return err
	}
	for _, e := range entries {
		if e.Type().IsRegular() && filepath.Base(dir) == "wal" {
			if err := openWritable(filepath.Join(dir, e.Name())); err != nil {
				return err
			}
		}
	}
	return nil
}

func probe(dir string) error {
	f, err := os.CreateTemp(dir, ".writable-*")
	if err != nil {
		return err
	}
	name := f.Name()
	f.Close()
	return os.Remove(name)
}

func openWritable(path string) error {
	h, err := os.OpenFile(path, os.O_RDWR, 0) //nolint:gosec // inside the owner's own data directory
	if err == nil {
		h.Close()
		return nil
	}
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	return err
}
