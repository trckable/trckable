package sqlite

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

// A database left at any earlier schema opens and migrates to the latest:
// every migration applies on top of the ones before it, as it will on a
// server that is upgraded.
func TestUpgradeFromEveryEarlierSchema(t *testing.T) {
	all := migrations
	defer func() { migrations = all }()
	ctx := context.Background()
	for n := 1; n < len(all); n++ {
		path := filepath.Join(t.TempDir(), "trckable.db")
		// The old schema, as the old binary left it: its migrations only.
		migrations = all[:n]
		db, err := sql.Open("sqlite", "file:"+path+"?_pragma=foreign_keys(ON)")
		if err != nil {
			t.Fatal(err)
		}
		if err := (&Store{DB: db}).migrate(ctx); err != nil {
			t.Fatalf("schema %d: %v", n, err)
		}
		db.Close()
		migrations = all
		st, err := Open(ctx, path)
		if err != nil {
			t.Fatalf("upgrading from schema %d: %v", n, err)
		}
		var v int
		st.DB.QueryRow(`PRAGMA user_version`).Scan(&v)
		st.Close()
		if v != len(all) {
			t.Fatalf("from schema %d: at %d, want %d", n, v, len(all))
		}
	}
}
