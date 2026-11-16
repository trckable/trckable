package sqlite

import "testing"

// A downstream build uses slots 85 and 86 for its own migrations, so here they
// stay no-ops: the list stays a prefix of theirs.
func TestReservedMigrationsAreNoOps(t *testing.T) {
	for _, n := range []int{85, 86} {
		if got := migrations[n-1]; got != `SELECT 1;` {
			t.Errorf("migration %d is reserved and must stay a no-op, got %q", n, got)
		}
	}
}

// A database an earlier build took to 85 with the share live column in it
// moves on to 87 without adding the column twice.
func TestShareLiveMigrationIsIdempotent(t *testing.T) {
	st, ctx, _ := domainSite(t)
	if _, err := st.DB.ExecContext(ctx, `PRAGMA user_version = 85`); err != nil {
		t.Fatal(err)
	}
	if err := st.MigrateTo(ctx, len(migrations)); err != nil {
		t.Fatal(err)
	}
	have, want, err := st.Schema(ctx)
	if err != nil || have != want {
		t.Fatalf("schema %d of %d: %v", have, want, err)
	}
}
