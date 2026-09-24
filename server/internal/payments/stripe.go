package payments

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"
)

// Stripe: money is the PaymentIntent (covers Checkout, Payment Links,
// Elements and invoices). Checkout sessions and invoices only add hints: tax,
// the visitor from metadata, the subscription, the payment kind. Since API
// version Basil (2025-03-31) invoices no longer name their PaymentIntent in
// webhooks; `invoice_payment.paid` links the two (an Alias).
type stripe struct{}

func init() { register(stripe{}) }

func (stripe) Name() string { return "stripe" }

// StripeEvents is what trckable subscribes to (also the manual-setup list).
var StripeEvents = []string{
	"payment_intent.succeeded",
	"checkout.session.completed",
	"checkout.session.async_payment_succeeded",
	"invoice.paid",
	"invoice_payment.paid",
	"charge.refunded",
	"refund.created",
	"refund.updated",
	"refund.failed",
	"charge.dispute.created",
	"charge.dispute.updated",
	"charge.dispute.closed",
}

// StripeAPIVersion is pinned on endpoints trckable creates, so payloads never
// change shape under us.
const StripeAPIVersion = "2026-08-26.dahlia"

func (stripe) Verify(h http.Header, body []byte, secret string, now time.Time) error {
	if secret == "" {
		return ErrSignature
	}
	ts, sigs, ok := signedPairs(h.Get("Stripe-Signature"), ",")
	if !ok {
		return ErrSignature
	}
	if !fresh(ts, now) {
		return ErrStale
	}
	msg := append([]byte(strconv.FormatInt(ts, 10)+"."), body...)
	for _, s := range sigs["v1"] { // only v1; v0 is a test-mode decoy
		if hexHMACEqual(s, []byte(secret), msg) {
			return nil
		}
	}
	return ErrSignature
}

type stripeEvent struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Created  int64  `json:"created"`
	Livemode bool   `json:"livemode"`
	Data     struct {
		Object json.RawMessage `json:"object"`
	} `json:"data"`
}

type sMeta map[string]any

func (stripe) Parse(body []byte) (Event, error) {
	var e stripeEvent
	if err := json.Unmarshal(body, &e); err != nil {
		return Event{}, err
	}
	ev := Event{Key: e.ID, Type: e.Type, At: e.Created * 1000, Test: !e.Livemode}
	obj := e.Data.Object
	switch e.Type {
	case "payment_intent.succeeded":
		var pi struct {
			ID             string          `json:"id"`
			AmountReceived int64           `json:"amount_received"`
			Currency       string          `json:"currency"`
			Customer       json.RawMessage `json:"customer"`
			Metadata       sMeta           `json:"metadata"`
			ReceiptEmail   string          `json:"receipt_email"`
			Invoice        json.RawMessage `json:"invoice"` // pre-Basil only
		}
		if err := json.Unmarshal(obj, &pi); err != nil {
			return ev, err
		}
		if pi.AmountReceived <= 0 {
			return ev, nil
		}
		cus, vis := idOf(pi.Customer), visitorFrom(pi.Metadata)
		ev.Payments = append(ev.Payments, Payment{ID: pi.ID, PaidAt: ev.At, Currency: pi.Currency, Gross: pi.AmountReceived,
			CustomerID: cus, Visitor: vis, Email: pi.ReceiptEmail})
		if inv := idOf(pi.Invoice); inv != "" {
			ev.Aliases = append(ev.Aliases, Alias{Alias: inv, PaymentID: pi.ID})
		}
		ev.Links = links(vis, cus, "")

	case "checkout.session.completed", "checkout.session.async_payment_succeeded":
		var cs struct {
			ID                string          `json:"id"`
			Mode              string          `json:"mode"`
			PaymentIntent     json.RawMessage `json:"payment_intent"`
			Invoice           json.RawMessage `json:"invoice"`
			Subscription      json.RawMessage `json:"subscription"`
			Customer          json.RawMessage `json:"customer"`
			ClientReferenceID string          `json:"client_reference_id"`
			Metadata          sMeta           `json:"metadata"`
			TotalDetails      *struct {
				AmountTax int64 `json:"amount_tax"`
			} `json:"total_details"`
		}
		if err := json.Unmarshal(obj, &cs); err != nil {
			return ev, err
		}
		vis := visitorFrom(cs.Metadata)
		if vis == 0 {
			vis = strictVisitor(cs.ClientReferenceID)
		}
		cus, sub := idOf(cs.Customer), idOf(cs.Subscription)
		target := idOf(cs.PaymentIntent)
		if target == "" {
			target = idOf(cs.Invoice) // subscription mode: the first invoice
		}
		if target != "" {
			h := Hint{PaymentID: target, Source: "checkout:" + cs.ID, Visitor: vis, CustomerID: cus, SubscriptionID: sub}
			if cs.TotalDetails != nil {
				h.Tax = ptr(cs.TotalDetails.AmountTax)
			}
			if cs.Mode == "subscription" {
				h.Kind = KindSubscription
			}
			ev.Hints = append(ev.Hints, h)
		}
		ev.Links = links(vis, cus, sub)

	case "invoice.paid":
		var in struct {
			ID            string          `json:"id"`
			BillingReason string          `json:"billing_reason"`
			Customer      json.RawMessage `json:"customer"`
			TotalTaxes    []struct {
				Amount int64 `json:"amount"`
			} `json:"total_taxes"`
			Tax    *int64 `json:"tax"` // pre-Basil
			Parent *struct {
				SubscriptionDetails *struct {
					Subscription json.RawMessage `json:"subscription"`
					Metadata     sMeta           `json:"metadata"`
				} `json:"subscription_details"`
			} `json:"parent"`
			Subscription        json.RawMessage           `json:"subscription"`         // pre-Basil
			SubscriptionDetails *struct{ Metadata sMeta } `json:"subscription_details"` // pre-Basil
			PaymentIntent       json.RawMessage           `json:"payment_intent"`       // pre-Basil
			Lines               struct {
				Data []struct {
					Metadata sMeta `json:"metadata"`
				} `json:"data"`
			} `json:"lines"`
		}
		if err := json.Unmarshal(obj, &in); err != nil {
			return ev, err
		}
		var tax *int64
		if in.TotalTaxes != nil {
			var t int64
			for _, x := range in.TotalTaxes {
				t += x.Amount
			}
			tax = &t
		} else if in.Tax != nil {
			tax = in.Tax
		}
		sub := idOf(in.Subscription)
		metas := []map[string]any{}
		if in.Parent != nil && in.Parent.SubscriptionDetails != nil {
			sub = idOf(in.Parent.SubscriptionDetails.Subscription)
			metas = append(metas, in.Parent.SubscriptionDetails.Metadata)
		}
		if in.SubscriptionDetails != nil {
			metas = append(metas, in.SubscriptionDetails.Metadata)
		}
		for _, l := range in.Lines.Data {
			metas = append(metas, l.Metadata)
		}
		vis, cus := visitorFrom(metas...), idOf(in.Customer)
		kind := ""
		switch in.BillingReason {
		case "subscription_create":
			kind = KindSubscription
		case "subscription_cycle", "subscription_update", "subscription_threshold", "subscription":
			kind = KindRenewal
		}
		ev.Hints = append(ev.Hints, Hint{PaymentID: in.ID, Source: "invoice:" + in.ID, Tax: tax, Visitor: vis, CustomerID: cus, SubscriptionID: sub, Kind: kind})
		if pi := idOf(in.PaymentIntent); pi != "" {
			ev.Aliases = append(ev.Aliases, Alias{Alias: in.ID, PaymentID: pi})
		}
		ev.Links = links(vis, cus, sub)

	case "invoice_payment.paid":
		var ip struct {
			Invoice json.RawMessage `json:"invoice"`
			Payment struct {
				Type          string          `json:"type"`
				PaymentIntent json.RawMessage `json:"payment_intent"`
			} `json:"payment"`
		}
		if err := json.Unmarshal(obj, &ip); err != nil {
			return ev, err
		}
		if pi := idOf(ip.Payment.PaymentIntent); pi != "" && idOf(ip.Invoice) != "" {
			ev.Aliases = append(ev.Aliases, Alias{Alias: idOf(ip.Invoice), PaymentID: pi})
		}

	case "refund.created", "refund.updated", "refund.failed", "charge.refund.updated":
		var r struct {
			ID            string          `json:"id"`
			Amount        int64           `json:"amount"`
			Currency      string          `json:"currency"`
			Status        string          `json:"status"`
			PaymentIntent json.RawMessage `json:"payment_intent"`
			Charge        json.RawMessage `json:"charge"`
			Created       int64           `json:"created"`
		}
		if err := json.Unmarshal(obj, &r); err != nil {
			return ev, err
		}
		pay := idOf(r.PaymentIntent)
		if pay == "" {
			pay = idOf(r.Charge) // resolved through the charge alias
		}
		ev.Refunds = append(ev.Refunds, Refund{ID: r.ID, PaymentID: pay, Amount: r.Amount, Currency: r.Currency, Status: stripeRefundStatus(r.Status), At: r.Created * 1000})

	case "charge.refunded":
		var ch struct {
			ID             string          `json:"id"`
			AmountRefunded int64           `json:"amount_refunded"`
			Currency       string          `json:"currency"`
			PaymentIntent  json.RawMessage `json:"payment_intent"`
		}
		if err := json.Unmarshal(obj, &ch); err != nil {
			return ev, err
		}
		pay := idOf(ch.PaymentIntent)
		if pay == "" {
			return ev, nil
		}
		ev.Aliases = append(ev.Aliases, Alias{Alias: ch.ID, PaymentID: pay})
		ev.Refunds = append(ev.Refunds, Refund{ID: "cum:" + ch.ID, PaymentID: pay, Amount: ch.AmountRefunded, Currency: ch.Currency, Status: RefundSucceeded, At: ev.At, Cumulative: true})

	case "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed", "charge.dispute.funds_withdrawn", "charge.dispute.funds_reinstated":
		var d struct {
			ID            string          `json:"id"`
			Amount        int64           `json:"amount"`
			Currency      string          `json:"currency"`
			Status        string          `json:"status"`
			PaymentIntent json.RawMessage `json:"payment_intent"`
			Charge        json.RawMessage `json:"charge"`
			Created       int64           `json:"created"`
		}
		if err := json.Unmarshal(obj, &d); err != nil {
			return ev, err
		}
		pay := idOf(d.PaymentIntent)
		if pay == "" {
			pay = idOf(d.Charge)
		}
		st := DisputeOpen
		switch d.Status {
		case "lost":
			st = DisputeLost
		case "won", "warning_closed", "prevented":
			st = DisputeWon
		}
		ev.Disputes = append(ev.Disputes, Dispute{ID: d.ID, PaymentID: pay, Amount: d.Amount, Currency: d.Currency, Status: st, At: ev.At})
	}
	return ev, nil
}

func stripeRefundStatus(s string) string {
	switch s {
	case "succeeded":
		return RefundSucceeded
	case "failed", "canceled":
		return RefundFailed
	}
	return RefundPending
}

// idOf reads a Stripe reference: either "id" or an expanded {"id": …}.
func idOf(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	var o struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(raw, &o) == nil {
		return o.ID
	}
	return ""
}
