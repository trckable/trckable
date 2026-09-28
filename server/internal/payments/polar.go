package payments

import (
	"encoding/json"
	"net/http"
	"time"
)

// Polar: the order is the payment (order.paid, and order.updated/refunded
// carry the refunded totals). Checkout metadata becomes order metadata, and
// renewals inherit the subscription's copy, so attribution survives renewals.
// Signing follows Standard Webhooks; secrets from before 2026-09-08 use the
// raw secret string as the key, newer ones the base64-decoded whsec_ part,
// and the prefix doesn't tell which, so both keys are tried.
type polar struct{}

func init() { register(polar{}) }

func (polar) Name() string { return "polar" }

// PolarEvents is what trckable subscribes to.
var PolarEvents = []string{"order.paid", "order.updated", "order.refunded", "refund.created", "refund.updated"}

// PolarAPIVersion is pinned on endpoints trckable creates.
const PolarAPIVersion = "2026-04"

func (polar) Verify(h http.Header, body []byte, secret string, now time.Time) error {
	if secret == "" {
		return ErrSignature
	}
	return verifyStandardWebhooks(h, body, standardKeys(secret), now)
}

func (polar) Parse(body []byte) (Event, error) {
	var e struct {
		Type      string          `json:"type"`
		Timestamp string          `json:"timestamp"`
		Data      json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &e); err != nil {
		return Event{}, err
	}
	ev := Event{Type: e.Type, At: rfc3339ms(e.Timestamp)}
	switch e.Type {
	case "order.paid", "order.updated", "order.refunded", "order.created":
		var o struct {
			ID                string         `json:"id"`
			CreatedAt         string         `json:"created_at"`
			ModifiedAt        string         `json:"modified_at"`
			Status            string         `json:"status"`
			Paid              bool           `json:"paid"`
			TaxAmount         int64          `json:"tax_amount"`
			TotalAmount       int64          `json:"total_amount"`
			RefundedAmount    int64          `json:"refunded_amount"`
			RefundedTaxAmount int64          `json:"refunded_tax_amount"`
			Currency          string         `json:"currency"`
			BillingReason     string         `json:"billing_reason"`
			CustomerID        string         `json:"customer_id"`
			SubscriptionID    string         `json:"subscription_id"`
			Metadata          map[string]any `json:"metadata"`
			Customer          *struct {
				Email    string         `json:"email"`
				Metadata map[string]any `json:"metadata"`
			} `json:"customer"`
		}
		if err := json.Unmarshal(e.Data, &o); err != nil {
			return ev, err
		}
		if ev.At == 0 {
			ev.At = rfc3339ms(o.ModifiedAt)
		}
		ev.Key = e.Type + ":" + o.ID + ":" + o.ModifiedAt + ":" + o.Status
		metas := []map[string]any{o.Metadata}
		email := ""
		if o.Customer != nil {
			metas, email = append(metas, o.Customer.Metadata), o.Customer.Email
		}
		vis := visitorFrom(metas...)
		paid := o.Paid || o.Status == "paid" || o.Status == "refunded" || o.Status == "partially_refunded"
		if paid && o.TotalAmount > 0 {
			kind := KindOneTime
			switch o.BillingReason {
			case "subscription_create":
				kind = KindSubscription
			case "subscription_cycle", "subscription_update", "subscription_meter_cycle":
				kind = KindRenewal
			}
			ev.Payments = append(ev.Payments, Payment{ID: o.ID, PaidAt: rfc3339ms(o.CreatedAt), Currency: o.Currency, Gross: o.TotalAmount, Tax: ptr(o.TaxAmount),
				CustomerID: o.CustomerID, SubscriptionID: o.SubscriptionID, Email: email, Visitor: vis, Kind: kind})
		}
		if back := o.RefundedAmount + o.RefundedTaxAmount; back > 0 {
			ev.Refunds = append(ev.Refunds, Refund{ID: "cum:" + o.ID, PaymentID: o.ID, Amount: back, Currency: o.Currency, Status: RefundSucceeded, At: ev.At, Cumulative: true})
		}
		ev.Links = links(vis, o.CustomerID, o.SubscriptionID)

	case "refund.created", "refund.updated":
		var r struct {
			ID         string `json:"id"`
			ModifiedAt string `json:"modified_at"`
			CreatedAt  string `json:"created_at"`
			OrderID    string `json:"order_id"`
			Amount     int64  `json:"amount"` // excluding tax
			TaxAmount  int64  `json:"tax_amount"`
			Currency   string `json:"currency"`
			Status     string `json:"status"`
		}
		if err := json.Unmarshal(e.Data, &r); err != nil {
			return ev, err
		}
		ev.Key = e.Type + ":" + r.ID + ":" + r.ModifiedAt + ":" + r.Status
		st := RefundPending
		switch r.Status {
		case "succeeded":
			st = RefundSucceeded
		case "failed", "canceled":
			st = RefundFailed
		}
		ev.Refunds = append(ev.Refunds, Refund{ID: r.ID, PaymentID: r.OrderID, Amount: r.Amount + r.TaxAmount, Currency: r.Currency, Status: st, At: rfc3339ms(r.CreatedAt)})
	}
	return ev, nil
}
