package payments

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// The provider trckable does not support. Every shop, every gateway, every
// hand-rolled checkout can report a sale in a format of our own, signed the
// same way trckable signs everything else:
//
//	POST /webhooks/custom/<connection>
//	Trckable-Timestamp: 1758579600                       (unix seconds)
//	Trckable-Signature: v1=<hex HMAC-SHA256 of "<timestamp>.<body>">
//
//	{"id":"evt_1","type":"payment","at":"2026-09-22T10:00:00Z","payment":{
//	  "id":"ord_1","amount":4900,"tax":800,"currency":"EUR",
//	  "kind":"one_time","email":"them@company.com","visitor":"trckable_vid value"}}
//
// Amounts are minor units, tax included — cents, not euros — because that is
// the only form that never rounds. The same rules as every other provider
// apply: revenue is amount minus tax, an id repeated is the same payment, and
// facts may arrive in any order.
type custom struct{}

func init() { register(custom{}) }

func (custom) Name() string { return "custom" }

// CustomEvents is what the dashboard tells people they can send.
var CustomEvents = []string{"payment", "refund", "dispute"}

// ErrBadCustom says the body is signed but does not describe anything.
var ErrBadCustom = errors.New("a custom webhook needs a type of payment, refund or dispute")

func (custom) Verify(h http.Header, body []byte, secret string, now time.Time) error {
	if secret == "" {
		return ErrSignature
	}
	tsS := strings.TrimSpace(h.Get("Trckable-Timestamp"))
	sig := strings.TrimSpace(h.Get("Trckable-Signature"))
	if tsS == "" || sig == "" {
		return ErrSignature
	}
	ts, err := strconv.ParseInt(tsS, 10, 64)
	if err != nil {
		return ErrSignature
	}
	if !fresh(ts, now) {
		return ErrStale
	}
	// A header may carry several versions, as Stripe's does, so each one is
	// tried rather than assuming there is exactly one.
	key, msg := []byte(secret), []byte(tsS+"."+string(body))
	for _, part := range strings.FieldsFunc(sig, func(r rune) bool { return r == ',' || r == ' ' }) {
		v, hexSig, ok := strings.Cut(part, "=")
		if !ok {
			v, hexSig = "v1", part // a bare signature is allowed
		}
		if v == "v1" && hexHMACEqual(hexSig, key, msg) {
			return nil
		}
	}
	return ErrSignature
}

// customTime accepts RFC 3339, unix seconds or unix milliseconds, because
// whoever writes the sending side should not have to guess.
type customTime int64

func (t *customTime) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		*t = customTime(rfc3339ms(s))
		return nil
	}
	var n int64
	if err := json.Unmarshal(b, &n); err != nil {
		return err
	}
	if n < 1e11 { // seconds, not milliseconds
		n *= 1000
	}
	*t = customTime(n)
	return nil
}

type customBody struct {
	ID   string     `json:"id"`
	Type string     `json:"type"`
	At   customTime `json:"at"`
	Test bool       `json:"test"`

	Payment *struct {
		ID             string     `json:"id"`
		Amount         int64      `json:"amount"`
		Tax            *int64     `json:"tax"`
		Currency       string     `json:"currency"`
		PaidAt         customTime `json:"paid_at"`
		Kind           string     `json:"kind"`
		CustomerID     string     `json:"customer_id"`
		SubscriptionID string     `json:"subscription_id"`
		Email          string     `json:"email"`
		Visitor        string     `json:"visitor"`
	} `json:"payment"`

	Refund *struct {
		ID        string     `json:"id"`
		PaymentID string     `json:"payment_id"`
		Amount    int64      `json:"amount"`
		Currency  string     `json:"currency"`
		At        customTime `json:"at"`
	} `json:"refund"`

	Dispute *struct {
		ID        string     `json:"id"`
		PaymentID string     `json:"payment_id"`
		Amount    int64      `json:"amount"`
		Currency  string     `json:"currency"`
		Status    string     `json:"status"`
		At        customTime `json:"at"`
	} `json:"dispute"`
}

func (custom) Parse(body []byte) (Event, error) {
	var b customBody
	if err := json.Unmarshal(body, &b); err != nil {
		return Event{}, err
	}
	ev := Event{Key: b.ID, Type: b.Type, At: int64(b.At), Test: b.Test}
	switch b.Type {
	case "payment":
		if b.Payment == nil || b.Payment.ID == "" || b.Payment.Amount <= 0 {
			return ev, nil // signed, but there is no sale in it
		}
		p := b.Payment
		at := int64(p.PaidAt)
		if at == 0 {
			at = ev.At
		}
		kind := p.Kind
		if kind != KindSubscription && kind != KindRenewal {
			kind = KindOneTime
		}
		visitor := ParseVisitor(p.Visitor)
		ev.Payments = []Payment{{
			ID: p.ID, PaidAt: at, Currency: strings.ToUpper(p.Currency), Gross: p.Amount, Tax: p.Tax,
			CustomerID: p.CustomerID, SubscriptionID: p.SubscriptionID, Email: p.Email,
			Visitor: visitor, Kind: kind,
		}}
		ev.Links = links(visitor, p.CustomerID, p.SubscriptionID)

	case "refund":
		if b.Refund == nil || b.Refund.ID == "" || b.Refund.PaymentID == "" {
			return ev, nil
		}
		r := b.Refund
		at := int64(r.At)
		if at == 0 {
			at = ev.At
		}
		ev.Refunds = []Refund{{ID: r.ID, PaymentID: r.PaymentID, Amount: r.Amount, Currency: strings.ToUpper(r.Currency), Status: RefundSucceeded, At: at}}

	case "dispute":
		if b.Dispute == nil || b.Dispute.ID == "" || b.Dispute.PaymentID == "" {
			return ev, nil
		}
		d := b.Dispute
		at := int64(d.At)
		if at == 0 {
			at = ev.At
		}
		status := d.Status
		switch status {
		case DisputeOpen, DisputeWon, DisputeLost:
		default:
			status = DisputeOpen
		}
		ev.Disputes = []Dispute{{ID: d.ID, PaymentID: d.PaymentID, Amount: d.Amount, Currency: strings.ToUpper(d.Currency), Status: status, At: at}}
	}
	// Without an id of their own, the facts themselves make a stable key, so
	// the same sale sent twice is still one sale.
	if ev.Key == "" {
		ev.Key = customKey(b)
	}
	return ev, nil
}

// customKey derives a dedupe key from what the event is about.
func customKey(b customBody) string {
	switch {
	case b.Payment != nil && b.Payment.ID != "":
		return "payment:" + b.Payment.ID
	case b.Refund != nil && b.Refund.ID != "":
		return "refund:" + b.Refund.ID
	case b.Dispute != nil && b.Dispute.ID != "":
		return "dispute:" + b.Dispute.ID + ":" + b.Dispute.Status
	}
	return ""
}
