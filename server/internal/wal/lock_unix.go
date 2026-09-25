//go:build unix

package wal

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
)

// lockDir takes the data directory's log for this process alone. Two writers
// on one log (an import while the server runs, say) would each trim and
// append to the same segment and corrupt it, so the second one is refused at
// once instead of waiting.
func lockDir(dir string) (*os.File, error) {
	f, err := os.OpenFile(filepath.Join(dir, "LOCK"), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) {
			return nil, ErrLocked
		}
		return nil, err
	}
	return f, nil
}
