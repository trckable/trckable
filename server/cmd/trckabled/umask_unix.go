//go:build unix

package main

import "syscall"

// Everything trckabled writes (the databases, their logs, backups, the
// geo files) is for its own user: files it creates are 0600 and directories
// 0700, whatever umask it was started with.
func init() { syscall.Umask(0o077) }
