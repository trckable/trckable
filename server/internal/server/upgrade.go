package server

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/trckable/trckable/server/internal/config"
	"github.com/trckable/trckable/server/internal/secrets"
	"github.com/trckable/trckable/server/internal/store/duck"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/upgrade"
)

// openControl opens the control database for the server, upgrading the data
// directory first when it was written by an older trckable: a copy of both
// stores is kept before any migration runs, and without one nothing starts.
// A normal start reads two values and goes on.
func openControl(ctx context.Context, cfg config.Config) (*sqlite.Store, error) {
	return OpenControl(ctx, cfg, 30*time.Second)
}

// OpenControl is openControl for the commands that open the control database
// themselves. duckWait is how long to wait for the analytics store when an
// upgrade needs it and another process still holds it.
func OpenControl(ctx context.Context, cfg config.Config, duckWait time.Duration) (*sqlite.Store, error) {
	ctl, err := sqlite.OpenUnmigrated(cfg.SQLitePath())
	if err != nil {
		return nil, fmt.Errorf("open control plane: %w", err)
	}
	_, err = upgrade.Run(ctx, ctl, upgrade.Options{
		DataDir:  cfg.DataDir,
		DuckPath: cfg.DuckPath(),
		Version:  Version,
		Key: func() ([]byte, error) {
			box, err := secrets.Load(cfg.DataDir, cfg.Secret)
			if err != nil {
				return nil, err
			}
			return box.Derive("backup"), nil
		},
		DuckWait: duckWait,
		Duck:     duck.Options{Threads: cfg.DuckThreads, MemoryLimit: cfg.DuckMemory},
		Log:      slog.Info,
	})
	if err == nil {
		err = ctl.Migrate(ctx)
	}
	if err != nil {
		ctl.Close()
		return nil, fmt.Errorf("open control plane: %w", err)
	}
	return ctl, nil
}
