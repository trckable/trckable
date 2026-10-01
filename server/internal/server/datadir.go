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

// PrepareDataDir makes the data directory if it is missing and proves this
// process can write to it. The published image runs as an unprivileged user
// (65532), and a volume an older image filled as root is not writable by it:
// say so, and say what to run, instead of the first database error that
// happens to come up.
func PrepareDataDir(dir string) error {
	err := writableDir(dir)
	if err == nil {
		return nil
	}
	if errors.Is(err, fs.ErrPermission) {
		return fmt.Errorf("data dir %s is not writable by this user (uid %d): "+
			"the image runs as an unprivileged user, so a volume written by an older image needs its owner changed once. "+
			"Run: chown -R %d:%d %s (on the host, or in a one-off container as root), or start the container with --user set to the volume's owner",
			dir, os.Geteuid(), nonrootID, nonrootID, dir)
	}
	return fmt.Errorf("data dir: %w", err)
}

func writableDir(dir string) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	probe, err := os.CreateTemp(dir, ".writable-*")
	if err != nil {
		return err
	}
	name := probe.Name()
	probe.Close()
	if err := os.Remove(name); err != nil {
		return err
	}
	// Files an older, root-running image left behind can be unwritable even
	// when the directory itself was handed over.
	for _, f := range privateFiles {
		h, err := os.OpenFile(filepath.Join(dir, f), os.O_RDWR, 0) //nolint:gosec // the data directory is the operator's own setting
		if err == nil {
			h.Close()
		} else if !errors.Is(err, fs.ErrNotExist) {
			return err
		}
	}
	return nil
}
