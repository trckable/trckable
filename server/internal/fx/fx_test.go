package fx

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

const ecb = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
<Cube>
 <Cube time="2026-09-18"><Cube currency="USD" rate="1.1000"/><Cube currency="JPY" rate="160.00"/><Cube currency="GBP" rate="0.8500"/></Cube>
 <Cube time="2026-09-17"><Cube currency="USD" rate="1.0000"/><Cube currency="JPY" rate="150.00"/></Cube>
</Cube>
</gesmes:Envelope>`

func TestConvertCarriesRatesForward(t *testing.T) {
	ctx := context.Background()
	st, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	r := &Rates{DB: st.DB}
	if n, err := r.Import(ctx, strings.NewReader(ecb)); err != nil || n != 5 {
		t.Fatalf("import: %d %v", n, err)
	}
	r.Reload(ctx)
	cases := []struct {
		amount   int64
		from, to string
		day      string
		want     int64
		ok       bool
	}{
		{1000, "EUR", "USD", "2026-09-18", 1100, true}, // €10.00 → $11.00
		{1100, "USD", "EUR", "2026-09-18", 1000, true}, // back
		{1000, "USD", "JPY", "2026-09-17", 1500, true}, // $10.00 → ¥1500 (0 decimals)
		{1000, "USD", "USD", "1999-01-01", 1000, true}, // same currency never needs a rate
		{1000, "EUR", "USD", "2026-09-20", 1100, true}, // Sunday: Friday's rate
		{1000, "EUR", "GBP", "2026-09-17", 0, false},   // GBP unknown that day and before
		{1000, "EUR", "USD", "2026-09-10", 0, false},   // before any stored rate
		{1000, "EUR", "USD", "2026-10-30", 0, false},   // stale (> 10 days): wait for a fetch
		{1000, "KWD", "USD", "2026-09-18", 0, false},   // not an ECB currency
	}
	for _, c := range cases {
		got, ok := r.Convert(ctx, c.amount, c.from, c.to, c.day)
		if got != c.want || ok != c.ok {
			t.Errorf("Convert(%d %s→%s %s) = %d,%v want %d,%v", c.amount, c.from, c.to, c.day, got, ok, c.want, c.ok)
		}
	}
}
