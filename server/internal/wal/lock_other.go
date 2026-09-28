//go:build !unix

package wal

import "os"

// lockDir is a no-op where flock does not exist: trckabled ships for Linux
// and macOS, and a stray second writer there is caught by the unix build.
func lockDir(string) (*os.File, error) { return nil, nil }
