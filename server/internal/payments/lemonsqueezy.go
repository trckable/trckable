package payments

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Lemon Squeezy: orders and subscription invoices are the payments. A new
// subscription sends order_created *and* subscription_payment_success with
// billing_reason "initial"; only the order counts. Refund amounts are
// cumulative per order/invoice. Webhooks carry no timestamp and no event id,
// so the dedupe key is event + object + updated_at.
type lemonSqueezy struct{}

func init() { register(lemonSqueezy{}) }

func (lemonSqueezy) Name() string { return "lemonsqueezy" }

// LemonSqueezyEvents is what trckable subscribes to.
var LemonSqueezyEvents = []string{
	"order_created", "order_refunded",
	"subscription_created",
	"subscription_payment_success", "subscription_payment_refunded",
}

func (lemonSqueezy) Verify(h http.Header, body []byte, secret string, _ time.Time) error {
	if secret == "" || !hexHMACEqual(h.Get("X-Signature"), []byte(secret), body) {
		return ErrSignature
	}
	return nil
}

func (lemonSqueezy) Parse(body []byte) (Event, error) {
	var e struct {
		Meta struct {
			EventName  string         `json:"event_name"`
			CustomData map[string]any `json:"custom_data"`
			TestMode   *bool          `json:"test_mode"`
		} `json:"meta"`
		Data struct {
			Type       string `json:"type"`
			ID         string `json:"id"`
			Attributes struct {
				CustomerID     int64  `json:"customer_id"`
				SubscriptionID int64  `json:"subscription_id"`
				OrderID        int64  `json:"order_id"`
				UserEmail      string `json:"user_email"`
				Currency       string `json:"currency"`
				Total          int64  `json:"total"`
				Tax            int64  `json:"tax"`
				RefundedAmount int64  `json:"refunded_amount"`
				Status         string `json:"status"`
				BillingReason  string `json:"billing_reason"`
				CreatedAt      string `json:"created_at"`
				UpdatedAt      string `json:"updated_at"`
				TestMode       bool   `json:"test_mode"`
			} `json:"attributes"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &e); err != nil {
		return Event{}, err
	}
	a := e.Data.Attributes
	at := rfc3339ms(a.UpdatedAt)
	ev := Event{
		Key:  fmt.Sprintf("%s:%s:%s:%s", e.Meta.EventName, e.Data.Type, e.Data.ID, a.UpdatedAt),
		Type: e.Meta.EventName, At: at, Test: a.TestMode || (e.Meta.TestMode != nil && *e.Meta.TestMode),
	}
	vis := visitorFrom(e.Meta.CustomData)
	cus, sub := idStr(a.CustomerID), idStr(a.SubscriptionID)
	paid := a.Status == "paid" || a.Status == "refunded" || a.Status == "partial_refund"

	switch e.Meta.EventName {
	case "order_created", "order_refunded":
		id := "order:" + e.Data.ID
		if paid && a.Total > 0 {
			ev.Payments = append(ev.Payments, Payment{ID: id, PaidAt: rfc3339ms(a.CreatedAt), Currency: a.Currency, Gross: a.Total, Tax: ptr(a.Tax),
				CustomerID: cus, Email: a.UserEmail, Visitor: vis})
		}
		if a.RefundedAmount > 0 {
			ev.Refunds = append(ev.Refunds, Refund{ID: "cum:" + id, PaymentID: id, Amount: a.RefundedAmount, Currency: a.Currency, Status: RefundSucceeded, At: at, Cumulative: true})
		}
		ev.Links = links(vis, cus, "")

	case "subscription_created":
		// The subscription itself: tie it (and its first order) to the visitor.
		ev.Links = links(vis, cus, e.Data.ID)
		if a.OrderID != 0 {
			ev.Hints = append(ev.Hints, Hint{PaymentID: "order:" + idStr(a.OrderID), Source: "subscription:" + e.Data.ID,
				Visitor: vis, CustomerID: cus, SubscriptionID: e.Data.ID, Kind: KindSubscription})
		}

	case "subscription_payment_success", "subscription_payment_refunded":
		id := "sinv:" + e.Data.ID
		if a.BillingReason == "initial" {
			return ev, nil // counted as the order
		}
		if paid && a.Total > 0 {
			ev.Payments = append(ev.Payments, Payment{ID: id, PaidAt: rfc3339ms(a.CreatedAt), Currency: a.Currency, Gross: a.Total, Tax: ptr(a.Tax),
				CustomerID: cus, SubscriptionID: sub, Email: a.UserEmail, Visitor: vis, Kind: KindRenewal})
		}
		if a.RefundedAmount > 0 {
			ev.Refunds = append(ev.Refunds, Refund{ID: "cum:" + id, PaymentID: id, Amount: a.RefundedAmount, Currency: a.Currency, Status: RefundSucceeded, At: at, Cumulative: true})
		}
		ev.Links = links(vis, cus, sub)
	}
	return ev, nil
}

func idStr(n int64) string {
	if n == 0 {
		return ""
	}
	return fmt.Sprint(n)
}

func rfc3339ms(s string) int64 {
	if s == "" {
		return 0
	}
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		return 0
	}
	return t.UnixMilli()
}
