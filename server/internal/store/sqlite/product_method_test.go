package sqlite

import (
	"context"
	"strconv"
	"testing"
)

// Migration 84: a payment stored before it keeps its row and reads an empty
// product and method, which a later read of its webhook fills in.
func TestProductMethodMigration(t *testing.T) {
	ctx := context.Background()
	st := openT(t)
	site, _ := st.CreateSite(ctx, DefaultAccount, "shop.com", "")
	if _, err := st.DB.ExecContext(ctx, `ALTER TABLE pay_payments DROP COLUMN product; ALTER TABLE pay_payments DROP COLUMN method; ALTER TABLE pay_hints DROP COLUMN product; ALTER TABLE pay_hints DROP COLUMN method; PRAGMA user_version = `+strconv.Itoa(len(migrations)-1)); err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.ExecContext(ctx, `INSERT INTO pay_payments (site_id, provider, id, connection_id, paid_at, currency, gross, version) VALUES (?, 'stripe', 'pi_1', '', 1, 'USD', 500, 1)`, site); err != nil {
		t.Fatal(err)
	}
	if err := st.MigrateTo(ctx, len(migrations)); err != nil {
		t.Fatal(err)
	}
	var product, method string
	if err := st.DB.QueryRowContext(ctx, `SELECT product, method FROM pay_payments WHERE id = 'pi_1'`).Scan(&product, &method); err != nil || product != "" || method != "" {
		t.Fatalf("got %q %q %v", product, method, err)
	}
}
