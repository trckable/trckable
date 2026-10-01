package server

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ClearLoginsFile asks a running server to forget the sign-in counters of
// some accounts: `trckabled admin reset-password` appends an email to it, and
// the server (a different process, with the counters in memory) takes it up
// within seconds. Anyone who can create it can already change any password.
const ClearLoginsFile = ".clear-logins"

// runLoginResets polls for the file and clears what it names.
func (s *Server) runLoginResets(ctx context.Context) {
	poll := time.NewTicker(2 * time.Second)
	defer poll.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-poll.C:
			s.takeLoginResets()
		}
	}
}

// takeLoginResets reads and removes the file, and clears each account in it.
// It is renamed first, so an email appended while it is read is not lost.
func (s *Server) takeLoginResets() {
	path := filepath.Join(s.cfg.DataDir, ClearLoginsFile)
	taken := path + ".taken"
	if err := os.Rename(path, taken); err != nil {
		return
	}
	b, err := os.ReadFile(taken) //nolint:gosec // inside the owner's own data directory
	_ = os.Remove(taken)
	if err != nil {
		return
	}
	for _, email := range strings.Fields(string(b)) {
		s.api.ClearLoginLimits(email)
		slog.Info("sign-in limits cleared", "account", email)
	}
}
