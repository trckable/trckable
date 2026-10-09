package payments

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Gumroad: a ping is an unsigned POST (form-encoded, or JSON when the seller
// chose that) with the sale in it, one per sale, refund or dispute. There is
// nothing to verify a body against, so the URL carries a secret instead:
//
//	https://stats.example.com/webhooks/gumroad/<connection>?token=<secret>
//
// The handler lifts the query value into PingTokenHeader and Verify compares
// it with the connection's secret in constant time. Whoever knows the URL can
// send pings for that connection, which is the most Gumroad allows; keep it
// private and rotate it by reconnecting.
//
// Fields follow Gumroad's own source (Purchase::PingNotification): price is
// the sale in minor units of the product's currency (lowercase code) and says
// nothing about tax, so revenue is the price. Every ping of a sale carries
// the same payment, so a refund or dispute that arrives first still creates
// it. The ping has no event time: the sale time is used, nudged by a
// millisecond per state (sale, refund, dispute, dispute won) so the later
// state always wins, in any arrival order.
type gumroad struct{}

func init() { register(gumroad{}) }

func (gumroad) Name() string { return "gumroad" }

// GumroadEvents is what trckable subscribes to (Gumroad calls them resources).
var GumroadEvents = []string{"sale", "refund", "dispute", "dispute_won"}

// PingTokenHeader is where the webhook handler puts the URL's token for
// Verify. It is set by the handler for every request (a value sent by the
// caller is dropped first), never read from the wire.
const PingTokenHeader = "X-Trckable-Ping-Token" //nolint:gosec // a header name, not a credential

func (gumroad) Verify(h http.Header, _ []byte, secret string, _ time.Time) error {
	got := h.Get(PingTokenHeader)
	if secret == "" || got == "" {
		return ErrSignature
	}
	// Hashed first so the comparison takes the same time for any length.
	a, b := sha256.Sum256([]byte(got)), sha256.Sum256([]byte(secret))
	if subtle.ConstantTimeCompare(a[:], b[:]) != 1 {
		return ErrSignature
	}
	return nil
}

// pingFields reads a ping body: JSON, or a form whose brackets nest
// (url_params[trckable_vid]=…).
func pingFields(body []byte) (map[string]any, error) {
	if t := strings.TrimSpace(string(body)); strings.HasPrefix(t, "{") {
		var m map[string]any
		return m, json.Unmarshal([]byte(t), &m)
	}
	q, err := url.ParseQuery(string(body))
	if err != nil {
		return nil, err
	}
	m := map[string]any{}
	for k, vs := range q {
		if len(vs) == 0 {
			continue
		}
		name, rest, nested := strings.Cut(k, "[")
		if !nested {
			m[k] = vs[0]
			continue
		}
		sub, _ := m[name].(map[string]any)
		if sub == nil {
			sub = map[string]any{}
			m[name] = sub
		}
		sub[strings.TrimSuffix(rest, "]")] = vs[0]
	}
	return m, nil
}

func fieldStr(m map[string]any, k string) string {
	switch v := m[k].(type) {
	case string:
		return strings.TrimSpace(v)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	}
	return ""
}

func fieldInt(m map[string]any, k string) int64 {
	switch v := m[k].(type) {
	case float64:
		return int64(v)
	case string:
		n, _ := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
		return n
	}
	return 0
}

func fieldFlag(m map[string]any, k string) bool {
	switch v := m[k].(type) {
	case bool:
		return v
	case string:
		return v == "true"
	}
	return false
}

func isCurrency(c string) bool {
	if len(c) != 3 {
		return false
	}
	for _, r := range c {
		if r < 'A' || r > 'Z' {
			return false
		}
	}
	return true
}

func (gumroad) Parse(body []byte) (Event, error) {
	m, err := pingFields(body)
	if err != nil {
		return Event{}, err
	}
	res := fieldStr(m, "resource_name")
	if res == "" {
		res = "sale" // the plain ping, set in Gumroad's settings, names none
	}
	ev := Event{Type: res, Test: fieldFlag(m, "test")}
	switch res {
	case "sale", "refund", "dispute", "dispute_won":
	default:
		return ev, nil // cancellations and subscription changes carry no money
	}
	id := fieldStr(m, "sale_id")
	if id == "" {
		return ev, nil
	}
	ev.Key = res + ":" + id

	paid := rfc3339ms(fieldStr(m, "sale_timestamp"))
	rank := int64(0)
	refunded := res == "refund" || fieldFlag(m, "refunded")
	disputed := res == "dispute" || fieldFlag(m, "disputed")
	won := res == "dispute_won" || fieldFlag(m, "dispute_won")
	switch {
	case won:
		rank = 3
	case disputed:
		rank = 2
	case refunded:
		rank = 1
	}
	ev.At = paid + rank

	price, cur := fieldInt(m, "price"), strings.ToUpper(fieldStr(m, "currency"))
	if price <= 0 || !isCurrency(cur) {
		return ev, nil
	}
	urlParams, _ := m["url_params"].(map[string]any)
	custom, _ := m["custom_fields"].(map[string]any)
	vis := visitorFrom(urlParams, custom)
	sub := fieldStr(m, "subscription_id")
	kind := KindOneTime
	switch {
	case sub != "" && fieldFlag(m, "is_recurring_charge"):
		kind = KindRenewal
	case sub != "":
		kind = KindSubscription
	}
	cus := fieldStr(m, "purchaser_id")
	ev.Payments = append(ev.Payments, Payment{ID: id, PaidAt: paid, Currency: cur, Gross: price,
		CustomerID: cus, SubscriptionID: sub, Email: fieldStr(m, "email"), Visitor: vis, Kind: kind})
	ev.Links = links(vis, cus, sub)
	if refunded {
		// The ping gives no refunded amount: the whole sale goes back.
		ev.Refunds = append(ev.Refunds, Refund{ID: "cum:" + id, PaymentID: id, Amount: price, Currency: cur, Status: RefundSucceeded, At: ev.At, Cumulative: true})
	}
	if disputed || won {
		st := DisputeLost // Gumroad takes the money back when a dispute is filed
		if won {
			st = DisputeWon
		}
		ev.Disputes = append(ev.Disputes, Dispute{ID: "dsp:" + id, PaymentID: id, Amount: price, Currency: cur, Status: st, At: ev.At})
	}
	return ev, nil
}
