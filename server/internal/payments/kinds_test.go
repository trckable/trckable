package payments

import (
	"fmt"
	"testing"
)

// What each provider says a payment was: the first of a subscription, a
// renewal, or a charged change of plan (an upgrade, with the plans when the
// payload names them). A change of plan that cost nothing is a renewal-sized
// nothing: there is no payment to call an upgrade.
func TestPaymentKindsPerProvider(t *testing.T) {
	stripeInvoice := func(reason string, paid int, lines string) string {
		return fmt.Sprintf(`{"id":"evt","type":"invoice.paid","created":1,"livemode":true,"data":{"object":{"id":"in_1","billing_reason":%q,"customer":"cus_1",
			"amount_paid":%d,"parent":{"subscription_details":{"subscription":"sub_1"}},"lines":{"data":[%s]}}}}`, reason, paid, lines)
	}
	paddleTxn := func(origin string, items string) string {
		return fmt.Sprintf(`{"event_id":"e","event_type":"transaction.completed","occurred_at":"2026-10-16T10:00:00Z","data":{"id":"txn_1","status":"completed","customer_id":"ctm_1",
			"subscription_id":"sub_1","currency_code":"USD","origin":%q,"items":[%s],"details":{"totals":{"tax":"0","total":"4900","grand_total":"4900"}}}}`, origin, items)
	}
	lemonInvoice := func(reason string) string {
		return fmt.Sprintf(`{"meta":{"event_name":"subscription_payment_success"},"data":{"type":"subscription-invoices","id":"7","attributes":{"customer_id":1,"subscription_id":2,
			"currency":"USD","total":4900,"tax":0,"status":"paid","billing_reason":%q,"created_at":"2026-10-16T10:00:00Z","updated_at":"2026-10-16T10:00:00Z"}}}`, reason)
	}
	named := `{"amount":-1500,"description":"Unused time on 1 × Pro (at $15.00 / month) after 16 Oct 2026"},
		{"amount":6400,"description":"Remaining time on 1 × Business (at $49.00 / month) after 16 Oct 2026"}`
	nick := `{"amount":-1500,"description":"x","price":{"nickname":"Starter"}},{"amount":6400,"description":"y","price":{"nickname":"Team"}}`

	type got struct{ kind, from, to string }
	hint := func(p Provider, body string) got {
		t.Helper()
		ev, err := p.Parse([]byte(body))
		if err != nil {
			t.Fatal(err)
		}
		for _, h := range ev.Hints {
			if h.Kind != "" {
				return got{h.Kind, h.FromPlan, h.ToPlan}
			}
		}
		for _, x := range ev.Payments {
			return got{x.Kind, "", ""}
		}
		return got{}
	}
	cases := []struct {
		name string
		p    Provider
		body string
		want got
	}{
		{"stripe create", stripe{}, stripeInvoice("subscription_create", 4900, ""), got{KindSubscription, "", ""}},
		{"stripe cycle", stripe{}, stripeInvoice("subscription_cycle", 4900, ""), got{KindRenewal, "", ""}},
		{"stripe update, plans from the lines", stripe{}, stripeInvoice("subscription_update", 4900, named), got{KindUpgrade, "Pro", "Business"}},
		{"stripe update, plans from the price nicknames", stripe{}, stripeInvoice("subscription_update", 4900, nick), got{KindUpgrade, "Starter", "Team"}},
		{"stripe update that cost nothing", stripe{}, stripeInvoice("subscription_update", 0, named), got{KindRenewal, "", ""}},
		{"paddle first", paddle{}, paddleTxn("web", ""), got{KindSubscription, "", ""}},
		{"paddle recurring", paddle{}, paddleTxn("subscription_recurring", ""), got{KindRenewal, "", ""}},
		{"paddle update", paddle{}, paddleTxn("subscription_update", `{"price":{"name":"Business"}}`), got{KindUpgrade, "", "Business"}},
		{"lemon renewal", lemonSqueezy{}, lemonInvoice("renewal"), got{KindRenewal, "", ""}},
		{"lemon update", lemonSqueezy{}, lemonInvoice("updated"), got{KindUpgrade, "", ""}},
	}
	for _, c := range cases {
		if g := hint(c.p, c.body); g != c.want {
			t.Errorf("%s: got %+v, want %+v", c.name, g, c.want)
		}
	}
}
