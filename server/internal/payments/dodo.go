package payments

import (
	"cmp"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Dodo Payments: Standard Webhooks (whsec_ secrets). The payment is the
// Payment object; total_amount includes tax. Payloads don't say test or live:
// the connection's mode does. Deliveries carry the object's latest state.
type dodo struct{}

func init() { register(dodo{}) }

func (dodo) Name() string { return "dodo" }

// DodoEvents is what trckable subscribes to.
var DodoEvents = []string{
	"payment.succeeded", "refund.succeeded", "refund.failed",
	"dispute.opened", "dispute.won", "dispute.lost", "dispute.accepted", "dispute.cancelled", "dispute.challenged", "dispute.expired",
	"subscription.active",
}

func (dodo) Verify(h http.Header, body []byte, secret string, now time.Time) error {
	if secret == "" {
		return ErrSignature
	}
	return verifyStandardWebhooks(h, body, standardKeys(secret), now)
}

// flexAmount accepts numbers or numeric strings (Dodo disputes use strings).
type flexAmount int64

func (a *flexAmount) UnmarshalJSON(b []byte) error {
	var n int64
	if err := json.Unmarshal(b, &n); err == nil {
		*a = flexAmount(n)
		return nil
	}
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	if s == "" {
		return nil
	}
	n, err := strconv.ParseInt(s, 10, 64)
	*a = flexAmount(n)
	return err
}

func (dodo) Parse(body []byte) (Event, error) {
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
	case "payment.succeeded":
		var p struct {
			PaymentID   string `json:"payment_id"`
			Status      string `json:"status"`
			TotalAmount int64  `json:"total_amount"`
			Tax         *int64 `json:"tax"`
			Currency    string `json:"currency"`
			// What the merchant receives, in their own currency: the buyer's
			// total above may be in a local currency Dodo showed them.
			SettlementAmount   int64          `json:"settlement_amount"`
			SettlementTax      *int64         `json:"settlement_tax"`
			SettlementCurrency string         `json:"settlement_currency"`
			SubscriptionID     string         `json:"subscription_id"`
			CreatedAt          string         `json:"created_at"`
			Metadata           map[string]any `json:"metadata"`
			PaymentMethod      string         `json:"payment_method"`
			ProductName        string         `json:"product_name"`
			ProductCart        []struct {
				Name        string `json:"name"`
				ProductName string `json:"product_name"`
				ProductID   string `json:"product_id"`
			} `json:"product_cart"`
			Customer struct {
				CustomerID string `json:"customer_id"`
				Email      string `json:"email"`
			} `json:"customer"`
		}
		if err := json.Unmarshal(e.Data, &p); err != nil {
			return ev, err
		}
		ev.Key = fmt.Sprintf("%s:%s:%s", e.Type, p.PaymentID, e.Timestamp)
		if p.TotalAmount <= 0 || (p.Status != "" && p.Status != "succeeded") {
			return ev, nil
		}
		kind := KindOneTime
		if p.SubscriptionID != "" {
			kind = KindSubscription // renewals are recognised by the ledger (a later payment of the same subscription)
		}
		cur, gross, tax := p.Currency, p.TotalAmount, p.Tax
		var chargeAmount int64
		var chargeCur string
		if p.SettlementAmount > 0 && p.SettlementCurrency != "" {
			cur, gross, tax = p.SettlementCurrency, p.SettlementAmount, p.SettlementTax
			if !strings.EqualFold(p.Currency, p.SettlementCurrency) {
				// Dodo refunds and disputes arrive in the buyer's currency.
				chargeAmount, chargeCur = p.TotalAmount, p.Currency
			}
		}
		vis := visitorFrom(p.Metadata)
		product, productID := p.ProductName, ""
		if len(p.ProductCart) > 0 {
			if product == "" {
				product = cmp.Or(p.ProductCart[0].Name, p.ProductCart[0].ProductName)
			}
			productID = p.ProductCart[0].ProductID
		}
		if product != "" {
			productID = ""
		}
		ev.Payments = append(ev.Payments, Payment{ID: p.PaymentID, PaidAt: rfc3339ms(p.CreatedAt), Currency: cur, Gross: gross, Tax: tax,
			CustomerID: p.Customer.CustomerID, SubscriptionID: p.SubscriptionID, Email: p.Customer.Email, Visitor: vis, Kind: kind,
			ChargeAmount: chargeAmount, ChargeCurrency: chargeCur, Product: ProductName(product), ProductID: productID, Method: MethodCode(p.PaymentMethod)})
		ev.Links = links(vis, p.Customer.CustomerID, p.SubscriptionID)

	case "refund.succeeded", "refund.failed":
		var r struct {
			RefundID  string     `json:"refund_id"`
			PaymentID string     `json:"payment_id"`
			Amount    flexAmount `json:"amount"`
			Currency  string     `json:"currency"`
			Status    string     `json:"status"`
			CreatedAt string     `json:"created_at"`
		}
		if err := json.Unmarshal(e.Data, &r); err != nil {
			return ev, err
		}
		ev.Key = fmt.Sprintf("%s:%s:%s", e.Type, r.RefundID, e.Timestamp)
		st := RefundPending
		switch {
		case e.Type == "refund.succeeded" || r.Status == "succeeded":
			st = RefundSucceeded
		case e.Type == "refund.failed" || r.Status == "failed":
			st = RefundFailed
		}
		ev.Refunds = append(ev.Refunds, Refund{ID: r.RefundID, PaymentID: r.PaymentID, Amount: int64(r.Amount), Currency: r.Currency, Status: st, At: rfc3339ms(r.CreatedAt)})

	case "dispute.opened", "dispute.won", "dispute.lost", "dispute.accepted", "dispute.cancelled", "dispute.challenged", "dispute.expired":
		var d struct {
			DisputeID     string     `json:"dispute_id"`
			PaymentID     string     `json:"payment_id"`
			Amount        flexAmount `json:"amount"`
			Currency      string     `json:"currency"`
			DisputeStatus string     `json:"dispute_status"`
			CreatedAt     string     `json:"created_at"`
		}
		if err := json.Unmarshal(e.Data, &d); err != nil {
			return ev, err
		}
		ev.Key = fmt.Sprintf("%s:%s:%s", e.Type, d.DisputeID, e.Timestamp)
		st := DisputeOpen
		switch d.DisputeStatus {
		case "dispute_lost", "dispute_accepted":
			st = DisputeLost
		case "dispute_won", "dispute_cancelled":
			st = DisputeWon
		}
		ev.Disputes = append(ev.Disputes, Dispute{ID: d.DisputeID, PaymentID: d.PaymentID, Amount: int64(d.Amount), Currency: d.Currency, Status: st, At: ev.At})

	case "subscription.active":
		var s struct {
			SubscriptionID string         `json:"subscription_id"`
			Metadata       map[string]any `json:"metadata"`
			Customer       struct {
				CustomerID string `json:"customer_id"`
			} `json:"customer"`
		}
		if err := json.Unmarshal(e.Data, &s); err != nil {
			return ev, err
		}
		ev.Key = fmt.Sprintf("%s:%s:%s", e.Type, s.SubscriptionID, e.Timestamp)
		ev.Links = links(visitorFrom(s.Metadata), s.Customer.CustomerID, s.SubscriptionID)
	}
	return ev, nil
}
