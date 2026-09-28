package duck

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

// With NoUpgrade, a store an older release wrote is refused, not migrated; a
// new one is created as usual, and a current one opens.
func TestNoUpgradeRefusesAnOlderStore(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "a.duckdb")
	st, err := OpenUnmigrated(path, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if err := st.MigrateTo(ctx, len(migrations)-1); err != nil {
		t.Fatal(err)
	}
	st.Close()
	if _, err := Open(ctx, path, Options{NoUpgrade: true}); !errors.Is(err, ErrNeedsUpgrade) {
		t.Fatalf("older store: %v, want ErrNeedsUpgrade", err)
	}
	st, err = OpenUnmigrated(path, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if have, _, _ := st.Schema(ctx); have != len(migrations)-1 {
		t.Fatalf("migrated anyway: at %d", have)
	}
	st.Close()

	fresh, err := Open(ctx, filepath.Join(t.TempDir(), "b.duckdb"), Options{NoUpgrade: true})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	fresh.Close()
	if st, err := Open(ctx, path, Options{}); err != nil {
		t.Fatal(err)
	} else {
		st.Close()
	}
	if st, err := Open(ctx, path, Options{NoUpgrade: true}); err != nil {
		t.Fatalf("current store: %v", err)
	} else {
		st.Close()
	}
}
