package revenue

import (
	"context"
	"fmt"
	"testing"
	"time"
)

// A rig with a Stripe connection that records every notice.
type noticeRig struct {
	*rig
	t     *testing.T
	path  string
	told  []Notice
	count int
}

func newNoticeRig(t *testing.T) *noticeRig {
	t.Helper()
	g := newRig(t, t.TempDir(), "instance key for tests")
	c, err := g.svc.Connect(context.Background(), ConnectRequest{Site: g.site, Provider: "stripe", Secret: "whsec_test", PublicBase: "http://localhost:8080"})
	if err != nil {
		t.Fatal(err)
	}
	// Connected a while ago: what a provider brings in from before is history.
	if _, err := g.st.DB.Exec(`UPDATE pay_connections SET created_at = created_at - 40 * 86400`); err != nil {
		t.Fatal(err)
	}
	n := &noticeRig{rig: g, t: t, path: HookPath("stripe", c.ID)}
	g.svc.OnNotice = func(_ string, x Notice) { n.told = append(n.told, x) }
	return n
}

// send delivers one Stripe event and processes the inbox.
func (n *noticeRig) send(typ string, created time.Time, object string) {
	n.t.Helper()
	n.count++
	body := []byte(fmt.Sprintf(`{"id":"evt_%d","type":%q,"created":%d,"livemode":true,"data":{"object":%s}}`, n.count, typ, created.Unix(), object))
	n.resend(body)
}

func (n *noticeRig) resend(body []byte) {
	n.t.Helper()
	if code := n.post(n.t, n.path, stripeSigned("whsec_test", body, time.Now()), body); code != 200 {
		n.t.Fatalf("webhook: %d", code)
	}
	if _, err := n.svc.Process(context.Background()); err != nil {
		n.t.Fatal(err)
	}
}

// wait lets the time a payment may wait for its invoice pass.
func (n *noticeRig) wait() {
	n.t.Helper()
	n.svc.Now = func() time.Time { return time.Now().Add(3 * time.Minute) }
	if _, err := n.svc.Process(context.Background()); err != nil {
		n.t.Fatal(err)
	}
}

func (n *noticeRig) invoice(reason, id string, at time.Time, lines string) {
	n.send("invoice.paid", at, fmt.Sprintf(`{"id":%q,"billing_reason":%q,"customer":"cus_1","total":4900,"amount_paid":4900,
		"parent":{"type":"subscription_details","subscription_details":{"subscription":"sub_1","metadata":{}}},"lines":{"data":[%s]}}`, id, reason, lines))
}

func (n *noticeRig) intent(pi, invoice string, at time.Time) {
	inv := ""
	if invoice != "" {
		inv = fmt.Sprintf(`,"invoice":%q`, invoice)
	}
	n.send("payment_intent.succeeded", at, fmt.Sprintf(`{"id":%q,"amount_received":4900,"currency":"usd","customer":"cus_1"%s}`, pi, inv))
}

// The four things a payment can be, as the customer's subscription moves: the
// first payment is a new customer, the next cycle a renewal, a charged change
// of plan an upgrade with the plans it named, and a plain charge a sale. Each
// is told once, however many events the provider sends about it.
func TestEachPaymentIsToldOnceWithWhatItWas(t *testing.T) {
	g := newNoticeRig(t)
	now := time.Now()

	g.invoice("subscription_create", "in_1", now, "")
	g.intent("pi_1", "in_1", now)
	g.intent("pi_1", "in_1", now) // the same payment, again
	g.invoice("subscription_cycle", "in_2", now, "")
	g.intent("pi_2", "in_2", now)
	g.invoice("subscription_update", "in_3", now, `
		{"amount":-1500,"description":"Unused time on 1 × Pro (at $15.00 / month) after 16 Oct 2026","price":{"nickname":null}},
		{"amount":6400,"description":"Remaining time on 1 × Business (at $49.00 / month) after 16 Oct 2026","price":{"nickname":null}}`)
	g.intent("pi_3", "in_3", now)
	g.send("payment_intent.succeeded", now, `{"id":"pi_4","amount_received":1200,"currency":"usd"}`)

	g.wait()
	kinds := []string{}
	for _, x := range g.told {
		kinds = append(kinds, x.Kind)
	}
	want := []string{NoticeNew, NoticeRenewal, NoticeUpgrade, NoticeSale}
	if fmt.Sprint(kinds) != fmt.Sprint(want) {
		t.Fatalf("told %v, want %v", kinds, want)
	}
	up := g.told[2]
	if up.From != "Pro" || up.To != "Business" || up.Late {
		t.Fatalf("the upgrade: %+v", up)
	}
	var n int
	if err := g.st.DB.QueryRow(`SELECT count(*) FROM pay_notices WHERE kind <> 'refund'`).Scan(&n); err != nil || n != 4 {
		t.Fatalf("notices kept: %d %v", n, err)
	}
	// The ledger counts the upgrade as the renewal-sized payment it is.
	facts, err := g.svc.Facts(context.Background(), g.site, "USD", now.Add(-time.Hour), now.Add(time.Hour), false)
	if err != nil {
		t.Fatal(err)
	}
	changed := 0
	for _, f := range facts {
		if f.Change == "upgrade" {
			changed++
			if f.Kind != "renewal" {
				t.Errorf("an upgrade counts as %q in the sums, want renewal", f.Kind)
			}
		}
	}
	if changed != 1 {
		t.Fatalf("upgrades in the ledger: %d, want 1", changed)
	}
}

// A payment the sync finds again later, or a webhook Stripe retries after the
// ledger was rebuilt, is not told a second time.
func TestRetriesAndSyncsDoNotTellAgain(t *testing.T) {
	g := newNoticeRig(t)
	now := time.Now()
	g.invoice("subscription_create", "in_1", now, "")
	g.intent("pi_1", "in_1", now)
	if len(g.told) != 1 {
		t.Fatalf("told %d, want 1", len(g.told))
	}
	// The ledger forgets the payment (a rebuild, a restore); the same notice
	// comes back from a reconciliation under another event id.
	if _, err := g.st.DB.Exec(`DELETE FROM pay_payments`); err != nil {
		t.Fatal(err)
	}
	g.intent("pi_1", "in_1", now)
	if len(g.told) != 1 {
		t.Fatalf("told again after a replay: %d", len(g.told))
	}
}

// Money found late still gets its notice, with its real time, but not the
// pulse; the past of a newly connected provider is history, not news.
func TestLatePaymentsAreToldWithTheirRealTime(t *testing.T) {
	g := newNoticeRig(t)
	paid := time.Now().Add(-5 * time.Hour)
	g.invoice("subscription_create", "in_1", paid, "")
	g.intent("pi_1", "in_1", paid)
	g.intent("pi_old", "", time.Now().Add(-10*24*time.Hour))
	g.wait()
	if len(g.told) != 1 {
		t.Fatalf("told %d, want the late one only: %+v", len(g.told), g.told)
	}
	n := g.told[0]
	if !n.Late || n.Kind != NoticeNew || time.UnixMilli(n.At).Unix() != paid.Unix() {
		t.Fatalf("the late notice: %+v", n)
	}
}

// Stripe reports a refund twice, as the refund and as the charge's total so
// far. The owner hears of each part of it once.
func TestRefundIsToldOncePerPart(t *testing.T) {
	g := newNoticeRig(t)
	now := time.Now()
	g.send("payment_intent.succeeded", now, `{"id":"pi_1","amount_received":4900,"currency":"usd","latest_charge":"ch_1"}`)
	g.told = nil
	g.send("refund.created", now, `{"id":"re_1","amount":1200,"currency":"usd","status":"succeeded","payment_intent":"pi_1","created":`+fmt.Sprint(now.Unix())+`}`)
	g.send("charge.refunded", now, `{"id":"ch_1","amount_refunded":1200,"currency":"usd","payment_intent":"pi_1"}`)
	g.send("refund.created", now, `{"id":"re_2","amount":800,"currency":"usd","status":"succeeded","payment_intent":"pi_1","created":`+fmt.Sprint(now.Unix())+`}`)
	g.send("charge.refunded", now, `{"id":"ch_1","amount_refunded":2000,"currency":"usd","payment_intent":"pi_1"}`)
	if len(g.told) != 2 || g.told[0].Amount != 1200 || g.told[1].Amount != 800 || g.told[0].Kind != NoticeRefund {
		t.Fatalf("refund notices: %+v", g.told)
	}
	if w := g.told[0].Words(""); w != "Refund · −$12" {
		t.Fatalf("words: %q", w)
	}
}

func TestWordsSayOnlyWhatIsKnown(t *testing.T) {
	cases := []struct {
		n      Notice
		source string
		want   string
	}{
		{Notice{Kind: NoticeNew, Amount: 4200, Currency: "USD", Exponent: 2}, "Google", "New customer · $42 · via Google"},
		{Notice{Kind: NoticeNew, Amount: 4190, Currency: "USD", Exponent: 2}, "", "New customer · $41.90"},
		{Notice{Kind: NoticeUpgrade, Amount: 21800, Currency: "USD", Exponent: 2, From: "Pro", To: "Business"}, "Google", "Upgrade · Pro → Business · +$218"},
		{Notice{Kind: NoticeUpgrade, Amount: 21800, Currency: "USD", Exponent: 2, To: "Business"}, "", "Upgrade · to Business · +$218"},
		{Notice{Kind: NoticeUpgrade, Amount: 21800, Currency: "USD", Exponent: 2}, "", "Upgrade · +$218"},
		{Notice{Kind: NoticeRenewal, Amount: 34800, Currency: "USD", Exponent: 2}, "Google", "Renewal · $348"},
		{Notice{Kind: NoticeSale, Amount: 1250000, Currency: "ISK", Exponent: 0}, "", "Sale · 1,250,000 ISK"},
		{Notice{Kind: NoticeRefund, Amount: 1200, Currency: "EUR", Exponent: 2}, "Google", "Refund · −€12"},
	}
	for _, c := range cases {
		if got := c.n.Words(c.source); got != c.want {
			t.Errorf("%+v: got %q, want %q", c.n, got, c.want)
		}
	}
}

// Stripe's events come in any order: the payment can arrive before the invoice
// that says it was a first payment or a renewal (on the newer API the payment
// carries no invoice, and a third event links them). The notice waits for it,
// so a new subscription is never announced as a sale.
func TestPaymentBeforeItsInvoiceIsToldWithTheInvoicesKind(t *testing.T) {
	for _, c := range []struct{ reason, want string }{{"subscription_create", NoticeNew}, {"subscription_cycle", NoticeRenewal}} {
		g := newNoticeRig(t)
		now := time.Now()
		g.intent("pi_1", "", now)
		if len(g.told) != 0 {
			t.Fatalf("%s: told before its invoice: %+v", c.reason, g.told)
		}
		g.invoice(c.reason, "in_1", now, "")
		g.send("invoice_payment.paid", now, `{"invoice":"in_1","payment":{"type":"payment_intent","payment_intent":"pi_1"}}`)
		if len(g.told) != 1 || g.told[0].Kind != c.want {
			t.Fatalf("%s: told %+v, want one %s", c.reason, g.told, c.want)
		}
		g.wait()
		if len(g.told) != 1 {
			t.Fatalf("%s: told again after the wait: %+v", c.reason, g.told)
		}
	}
}

// A payment whose invoice never comes (a one-off charge) is told as what it
// is once the wait is over.
func TestPaymentWithNoInvoiceIsToldAsASaleAfterTheWait(t *testing.T) {
	g := newNoticeRig(t)
	g.intent("pi_1", "", time.Now())
	g.wait()
	if len(g.told) != 1 || g.told[0].Kind != NoticeNew { // it has a customer nobody has seen before
		t.Fatalf("told %+v", g.told)
	}
}

// The first one-time purchase of a customer the ledger knows is a new
// customer; the next one from the same customer, or from nobody it can
// recognise, is a sale.
func TestFirstPurchaseIsANewCustomer(t *testing.T) {
	g := newNoticeRig(t)
	now := time.Now()
	g.send("payment_intent.succeeded", now, `{"id":"pi_1","amount_received":1200,"currency":"usd","customer":"cus_a"}`)
	g.send("payment_intent.succeeded", now, `{"id":"pi_2","amount_received":1200,"currency":"usd","customer":"cus_a"}`)
	g.send("payment_intent.succeeded", now, `{"id":"pi_3","amount_received":1200,"currency":"usd"}`)
	g.wait()
	got := []string{}
	for _, x := range g.told {
		got = append(got, x.Kind)
	}
	if fmt.Sprint(got) != fmt.Sprint([]string{NoticeNew, NoticeSale, NoticeSale}) {
		t.Fatalf("told %v", got)
	}
}

// What a provider brings in from before the connection existed is history:
// connecting tells nothing, and neither does a refund of an old payment.
func TestConnectingTellsNothingAboutThePast(t *testing.T) {
	g := newNoticeRig(t)
	if _, err := g.st.DB.Exec(`UPDATE pay_connections SET created_at = ?`, time.Now().Unix()); err != nil {
		t.Fatal(err)
	}
	past := time.Now().Add(-5 * time.Hour)
	g.invoice("subscription_create", "in_1", past, "")
	g.intent("pi_1", "in_1", past)
	g.send("refund.created", past.Add(time.Hour), `{"id":"re_1","amount":1200,"currency":"usd","status":"succeeded","payment_intent":"pi_1","created":`+fmt.Sprint(past.Unix())+`}`)
	g.wait()
	if len(g.told) != 0 {
		t.Fatalf("told about the past: %+v", g.told)
	}
}
