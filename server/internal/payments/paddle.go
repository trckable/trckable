package payments

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"
)

// Paddle Billing: the transaction is the payment; adjustments are refunds,
// credits and chargebacks (only "approved" ones move money). Amounts are
// integer strings in the lowest denomination. Payloads don't say sandbox or
// live: the connection's mode does.
type paddle struct{}

func init() { register(paddle{}) }

func (paddle) Name() string { return "paddle" }

// PaddleEvents is what trckable subscribes to.
var PaddleEvents = []string{"transaction.completed", "transaction.paid", "adjustment.created", "adjustment.updated"}

func (paddle) Verify(h http.Header, body []byte, secret string, now time.Time) error {
	if secret == "" {
		return ErrSignature
	}
	ts, sigs, ok := signedPairs(h.Get("Paddle-Signature"), ";")
	if !ok {
		return ErrSignature
	}
	if !fresh(ts, now) {
		return ErrStale
	}
	msg := append([]byte(strconv.FormatInt(ts, 10)+":"), body...)
	for _, s := range sigs["h1"] {
		if hexHMACEqual(s, []byte(secret), msg) {
			return nil
		}
	}
	return ErrSignature
}

// amount is Paddle's "integer as a string".
type amount int64

func (a *amount) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		var n int64
		if err2 := json.Unmarshal(b, &n); err2 != nil {
			return err
		}
		*a = amount(n)
		return nil
	}
	if s == "" {
		*a = 0
		return nil
	}
	n, err := strconv.ParseInt(s, 10, 64)
	*a = amount(n)
	return err
}

func (paddle) Parse(body []byte) (Event, error) {
	var e struct {
		EventID    string          `json:"event_id"`
		EventType  string          `json:"event_type"`
		OccurredAt string          `json:"occurred_at"`
		Data       json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &e); err != nil {
		return Event{}, err
	}
	ev := Event{Key: e.EventID, Type: e.EventType, At: rfc3339ms(e.OccurredAt)}
	switch e.EventType {
	case "transaction.completed", "transaction.paid":
		var t struct {
			ID             string         `json:"id"`
			Status         string         `json:"status"`
			CustomerID     string         `json:"customer_id"`
			SubscriptionID string         `json:"subscription_id"`
			CustomData     map[string]any `json:"custom_data"`
			CurrencyCode   string         `json:"currency_code"`
			Origin         string         `json:"origin"`
			BilledAt       string         `json:"billed_at"`
			CreatedAt      string         `json:"created_at"`
			Details        struct {
				Totals struct {
					Tax        amount `json:"tax"`
					Total      amount `json:"total"`
					GrandTotal amount `json:"grand_total"`
				} `json:"totals"`
			} `json:"details"`
		}
		if err := json.Unmarshal(e.Data, &t); err != nil {
			return ev, err
		}
		gross := int64(t.Details.Totals.GrandTotal)
		if gross == 0 {
			gross = int64(t.Details.Totals.Total)
		}
		if gross <= 0 || (t.Status != "paid" && t.Status != "completed") {
			return ev, nil
		}
		paidAt := rfc3339ms(t.BilledAt)
		if paidAt == 0 {
			paidAt = ev.At
		}
		kind := KindOneTime
		switch {
		case t.Origin == "subscription_recurring" || t.Origin == "subscription_update" || t.Origin == "subscription_charge":
			kind = KindRenewal
		case t.SubscriptionID != "":
			kind = KindSubscription
		}
		vis := visitorFrom(t.CustomData)
		ev.Payments = append(ev.Payments, Payment{ID: t.ID, PaidAt: paidAt, Currency: t.CurrencyCode, Gross: gross, Tax: ptr(int64(t.Details.Totals.Tax)),
			CustomerID: t.CustomerID, SubscriptionID: t.SubscriptionID, Visitor: vis, Kind: kind})
		ev.Links = links(vis, t.CustomerID, t.SubscriptionID)

	case "adjustment.created", "adjustment.updated":
		var a struct {
			ID            string `json:"id"`
			Action        string `json:"action"`
			TransactionID string `json:"transaction_id"`
			Status        string `json:"status"`
			CurrencyCode  string `json:"currency_code"`
			CreatedAt     string `json:"created_at"`
			Totals        struct {
				Total amount `json:"total"`
			} `json:"totals"`
		}
		if err := json.Unmarshal(e.Data, &a); err != nil {
			return ev, err
		}
		at := rfc3339ms(a.CreatedAt)
		switch a.Action {
		case "refund", "credit":
			st := RefundPending
			switch a.Status {
			case "approved":
				st = RefundSucceeded
			case "rejected", "reversed":
				st = RefundFailed
			}
			ev.Refunds = append(ev.Refunds, Refund{ID: a.ID, PaymentID: a.TransactionID, Amount: int64(a.Totals.Total), Currency: a.CurrencyCode, Status: st, At: at})
		case "chargeback", "chargeback_reverse":
			st := DisputeOpen
			if a.Status == "approved" {
				st = DisputeLost
				if a.Action == "chargeback_reverse" {
					st = DisputeWon
				}
			}
			// One dispute per transaction: a reversal (a later event) wins it back.
			ev.Disputes = append(ev.Disputes, Dispute{ID: "cb:" + a.TransactionID, PaymentID: a.TransactionID, Amount: int64(a.Totals.Total), Currency: a.CurrencyCode, Status: st, At: at})
		}
	}
	return ev, nil
}
