//go:build unix

package wal

import (
	"errors"
	"testing"
)

// One writer per log: a second open is refused at once, and closing the
// first lets the next one in.
func TestSecondWriterIsRefused(t *testing.T) {
	dir := t.TempDir()
	a, err := Open(dir, Options{NoSync: true})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Open(dir, Options{NoSync: true}); !errors.Is(err, ErrLocked) {
		t.Fatalf("second open: %v, want ErrLocked", err)
	}
	if err := a.Close(); err != nil {
		t.Fatal(err)
	}
	b, err := Open(dir, Options{NoSync: true})
	if err != nil {
		t.Fatalf("open after close: %v", err)
	}
	b.Close()
}
