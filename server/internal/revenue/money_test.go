package revenue

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/payments"
)

// A payer's data export and a sale shown live read the same money as the
// reports: the payment date as a date (paid_at is unix milliseconds), and
// Stripe's ISK in whole krónur, not a hundred times more
// (https://docs.stripe.com/currencies#special-cases).
func TestExportAndLiveSaleUseISOMinorUnits(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	c, err := g.svc.Connect(ctx, ConnectRequest{Site: g.site, Provider: "stripe", Secret: "whsec_test", PublicBase: "http://localhost:8080"})
	if err != nil {
		t.Fatal(err)
	}
	var sales []Notice
	g.svc.OnNotice = func(_ string, n Notice) { sales = append(sales, n) }
	paid := time.Now().Truncate(time.Second)
	body := []byte(fmt.Sprintf(`{"id":"evt_isk","object":"event","type":"payment_intent.succeeded","created":%d,"livemode":true,
 "data":{"object":{"id":"pi_isk","object":"payment_intent","amount_received":1250000,"currency":"isk","metadata":{"trckable_vid":"abc123.x"}}}}`, paid.Unix()))
	if code := g.post(t, HookPath("stripe", c.ID), stripeSigned("whsec_test", body, time.Now()), body); code != 200 {
		t.Fatalf("webhook: %d", code)
	}
	if _, err := g.svc.Process(ctx); err != nil {
		t.Fatal(err)
	}
	g.svc.Now = func() time.Time { return time.Now().Add(3 * time.Minute) } // the wait for its invoice is over
	if _, err := g.svc.Process(ctx); err != nil {
		t.Fatal(err)
	}
	if len(sales) != 1 || sales[0].Amount != 12500 || sales[0].Exponent != 0 || sales[0].Currency != "ISK" || sales[0].Kind != NoticeSale {
		t.Fatalf("live sale: %+v, want 12500 ISK with exponent 0", sales)
	}
	list, err := g.svc.PaymentsOf(ctx, g.site, payments.ParseVisitor("abc123.x"))
	if err != nil || len(list) != 1 {
		t.Fatalf("export: %+v %v", list, err)
	}
	if !list[0].PaidAt.Equal(paid.UTC()) {
		t.Errorf("export paid_at: %v, want %v", list[0].PaidAt, paid.UTC())
	}
	if list[0].Gross != 12500 {
		t.Errorf("export gross: %d, want 12500", list[0].Gross)
	}
}

// The data export names the billing country a payment carries, from the
// payment itself or from a hint that describes it.
func TestExportNamesTheBillingCountry(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	ctx := context.Background()
	for _, q := range []string{
		`INSERT INTO pay_payments (site_id, provider, id, connection_id, paid_at, currency, gross, visitor_id, kind, country, version) VALUES ('` + g.site + `', 'stripe', 'pa', 'c', 1000, 'USD', 500, 77, 'one_time', 'DE', 1)`,
		`INSERT INTO pay_payments (site_id, provider, id, connection_id, paid_at, currency, gross, visitor_id, kind, version) VALUES ('` + g.site + `', 'stripe', 'pb', 'c', 2000, 'USD', 700, 77, 'one_time', 1)`,
		`INSERT INTO pay_payments (site_id, provider, id, connection_id, paid_at, currency, gross, visitor_id, kind, version) VALUES ('` + g.site + `', 'stripe', 'pc', 'c', 3000, 'USD', 900, 77, 'one_time', 1)`,
		`INSERT INTO pay_hints (site_id, provider, payment_id, source, country, version) VALUES ('` + g.site + `', 'stripe', 'pb', 'checkout:cs', 'FR', 1)`,
	} {
		if _, err := g.svc.DB.ExecContext(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	list, err := g.svc.PaymentsOf(ctx, g.site, 77)
	if err != nil || len(list) != 3 {
		t.Fatalf("export: %+v %v", list, err)
	}
	if list[0].Country != "DE" || list[1].Country != "FR" || list[2].Country != "" {
		t.Errorf("countries: %q %q %q, want DE FR and none", list[0].Country, list[1].Country, list[2].Country)
	}
}
