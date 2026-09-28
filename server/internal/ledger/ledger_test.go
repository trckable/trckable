package ledger

import (
	"context"
	"database/sql"
	"encoding/json"
	"math/rand"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/fx"
	"github.com/trckable/trckable/server/internal/payments"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Each testdata scenario is a sequence of provider webhooks (shaped per the
// providers' official docs, 2026-09) and the ledger facts they must produce.
// Every scenario is applied in order, reversed, twice (retries), and in many
// random orders: the money must come out identical every time.
type scenario struct {
	Provider string            `json:"provider"`
	Note     string            `json:"note"`
	Events   []json.RawMessage `json:"events"`
	Currency string            `json:"currency"`
	Expect   []struct {
		ID       string `json:"id"`
		Amount   int64  `json:"amount"`
		Refunded int64  `json:"refunded"`
		Visitor  string `json:"visitor"`
		Kind     string `json:"kind"`
	} `json:"expect"`
}

func TestScenariosInEveryOrder(t *testing.T) {
	files, _ := filepath.Glob("testdata/*.json")
	if len(files) < 7 {
		t.Fatalf("expected scenario fixtures, found %d", len(files))
	}
	for _, f := range files {
		t.Run(filepath.Base(f), func(t *testing.T) {
			// Each order gets its own database: the scenarios share nothing.
			t.Parallel()

			raw, err := os.ReadFile(f) //nolint:gosec // a fixture from this package's testdata
			if err != nil {
				t.Fatal(err)
			}
			var sc scenario
			if err := json.Unmarshal(raw, &sc); err != nil {
				t.Fatal(err)
			}
			prov := payments.Registry[sc.Provider]
			if prov == nil {
				t.Fatalf("unknown provider %q", sc.Provider)
			}
			evs := make([]payments.Event, len(sc.Events))
			for i, b := range sc.Events {
				if evs[i], err = prov.Parse(b); err != nil {
					t.Fatalf("event %d: %v", i, err)
				}
			}
			orders := [][]int{seq(len(evs)), reverse(seq(len(evs))), append(seq(len(evs)), seq(len(evs))...)}
			rng := rand.New(rand.NewSource(1)) //nolint:gosec // a fixed seed so a failing order can be reproduced; nothing secret
			for i := 0; i < 25; i++ {
				orders = append(orders, rng.Perm(len(evs)))
			}
			for _, order := range orders {
				db, rates := fresh(t)
				apply(t, db, sc.Provider, evs, order)
				facts, err := Facts(context.Background(), db, rates, "site1", sc.Currency, time.Unix(0, 0), time.Now().AddDate(2, 0, 0), false)
				if err != nil {
					t.Fatal(err)
				}
				if len(facts) != len(sc.Expect) {
					t.Fatalf("order %v: %d facts, want %d: %+v", order, len(facts), len(sc.Expect), facts)
				}
				for i, want := range sc.Expect {
					got := facts[i]
					vis := ""
					if got.Visitor != 0 {
						vis = strconv.FormatUint(got.Visitor, 36)
					}
					if got.ID != want.ID || got.Amount != want.Amount || got.Refunded != want.Refunded || vis != want.Visitor || got.Kind != want.Kind || !got.Converted {
						t.Fatalf("order %v: fact %d = {id %s amount %d refunded %d visitor %q kind %s converted %v}, want %+v",
							order, i, got.ID, got.Amount, got.Refunded, vis, got.Kind, got.Converted, want)
					}
				}
			}
		})
	}
}

func TestResetAndReplayRebuildsTheSameLedger(t *testing.T) {
	raw, err := os.ReadFile("testdata/stripe_refunds_disputes.json")
	if err != nil {
		t.Fatal(err)
	}
	var sc scenario
	if err := json.Unmarshal(raw, &sc); err != nil {
		t.Fatal(err)
	}
	var evs []payments.Event
	for _, b := range sc.Events {
		e, err := payments.Registry["stripe"].Parse(b)
		if err != nil {
			t.Fatal(err)
		}
		evs = append(evs, e)
	}
	db, rates := fresh(t)
	ctx := context.Background()
	apply(t, db, "stripe", evs, seq(len(evs)))
	before, _ := Facts(ctx, db, rates, "site1", "USD", time.Unix(0, 0), time.Now().AddDate(2, 0, 0), true)
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := Reset(ctx, tx, "site1"); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if f, _ := Facts(ctx, db, rates, "site1", "USD", time.Unix(0, 0), time.Now().AddDate(2, 0, 0), true); len(f) != 0 {
		t.Fatalf("reset left %d facts", len(f))
	}
	apply(t, db, "stripe", evs, reverse(seq(len(evs))))
	after, _ := Facts(ctx, db, rates, "site1", "USD", time.Unix(0, 0), time.Now().AddDate(2, 0, 0), true)
	if len(before) != 3 || len(after) != 3 { // includes the test-mode payment
		t.Fatalf("facts: before %d after %d", len(before), len(after))
	}
	for i := range before {
		if before[i] != after[i] {
			t.Fatalf("replay differs: %+v vs %+v", before[i], after[i])
		}
	}
}

func TestForeignCurrencyWaitsForARate(t *testing.T) {
	db, rates := fresh(t)
	ctx := context.Background()
	ev := payments.Event{Key: "e1", At: 1758500000000, Payments: []payments.Payment{{ID: "p1", PaidAt: 1758500000000, Currency: "EUR", Gross: 1190, Tax: ptr(190)}}}
	apply(t, db, "stripe", []payments.Event{ev}, []int{0})
	f, _ := Facts(ctx, db, rates, "site1", "USD", time.Unix(0, 0), time.Now().AddDate(1, 0, 0), false)
	if len(f) != 1 || f[0].Converted {
		t.Fatalf("converted without a rate: %+v", f)
	}
	if _, err := db.Exec(`INSERT INTO fx_rates (day, currency, per_eur) VALUES ('2025-09-19', 'USD', 1.2)`); err != nil {
		t.Fatal(err)
	}
	if err := rates.Reload(ctx); err != nil {
		t.Fatal(err)
	}
	f, _ = Facts(ctx, db, rates, "site1", "USD", time.Unix(0, 0), time.Now().AddDate(1, 0, 0), false)
	if !f[0].Converted || f[0].Amount != 1200 { // €10.00 net → $12.00
		t.Fatalf("after rate: %+v", f[0])
	}
}

// A payment in a currency the ECB never publishes (dirham, naira, dinar…)
// will not convert tomorrow either: it is marked so the dashboard can say
// why it is missing, instead of promising today's rate. One in a published
// currency whose rate is merely late only waits.
func TestCurrencyWithoutAnyECBRateIsNamed(t *testing.T) {
	db, rates := fresh(t)
	ctx := context.Background()
	at := int64(1758500000000) // 2025-09-22
	apply(t, db, "stripe", []payments.Event{{Key: "e1", At: at, Payments: []payments.Payment{
		{ID: "p_aed", PaidAt: at, Currency: "aed", Gross: 5000, Tax: ptr(0)},
		{ID: "p_gbp", PaidAt: at + 1, Currency: "gbp", Gross: 5000, Tax: ptr(0)},
	}}}, []int{0})
	f, _ := Facts(ctx, db, rates, "site1", "USD", time.Unix(0, 0), time.Now().AddDate(1, 0, 0), false)
	if len(f) != 2 || f[0].NoRate || f[1].NoRate {
		t.Fatalf("before any rate is known nothing is written off: %+v", f)
	}
	if _, err := db.Exec(`INSERT INTO fx_rates (day, currency, per_eur) VALUES ('2025-09-01', 'USD', 1.2), ('2025-09-01', 'GBP', 0.85)`); err != nil {
		t.Fatal(err)
	}
	if err := rates.Reload(ctx); err != nil {
		t.Fatal(err)
	}
	f, _ = Facts(ctx, db, rates, "site1", "USD", time.Unix(0, 0), time.Now().AddDate(1, 0, 0), false)
	if f[0].Converted || !f[0].NoRate || f[0].Currency != "AED" {
		t.Fatalf("AED: %+v", f[0])
	}
	if f[1].Converted || f[1].NoRate { // GBP is published; this day's rate (21 days on) is just not in yet
		t.Fatalf("GBP: %+v", f[1])
	}
}

func ptr(v int64) *int64 { return &v }

func fresh(t *testing.T) (*sql.DB, *fx.Rates) {
	t.Helper()
	st, err := sqlite.Open(context.Background(), filepath.Join(t.TempDir(), "l.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	return st.DB, &fx.Rates{DB: st.DB}
}

func apply(t *testing.T, db *sql.DB, provider string, evs []payments.Event, order []int) {
	t.Helper()
	ctx := context.Background()
	for _, i := range order {
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			t.Fatal(err)
		}
		if err := Apply(ctx, tx, Scope{Site: "site1", Provider: provider, Connection: "pc_1"}, evs[i]); err != nil {
			tx.Rollback()
			t.Fatalf("apply %d: %v", i, err)
		}
		if err := tx.Commit(); err != nil {
			t.Fatal(err)
		}
	}
}

func seq(n int) []int {
	out := make([]int, n)
	for i := range out {
		out[i] = i
	}
	return out
}

func reverse(a []int) []int {
	out := make([]int, len(a))
	for i, v := range a {
		out[len(a)-1-i] = v
	}
	return out
}

// A refund takes back its share of tax exactly: integer arithmetic, never a
// float, which is off by a minor unit once amounts reach ten million.
func TestRefundTaxShareIsExact(t *testing.T) {
	cases := []struct{ a, b, c, want int64 }{
		{595, 1000, 1190, 500},                         // half of €11.90 incl. €1.90 tax: €5.00 net
		{333333380, 800000004, 1000000005, 266666704},  // a float gives 266666703
		{1000000005, 800000004, 1000000005, 800000004}, // a full refund is the whole net
		{1, 1, 3, 0}, // rounds to nearest
		{2, 1, 3, 1}, // 0.67 -> 1
		{999999999999, 999999999998, 999999999999, 999999999998}, // Stripe's 12-digit maximum
		{0, 5, 7, 0},
	}
	for _, c := range cases {
		if got := MulDiv(c.a, c.b, c.c); got != c.want {
			t.Errorf("MulDiv(%d, %d, %d) = %d, want %d", c.a, c.b, c.c, got, c.want)
		}
	}
}
