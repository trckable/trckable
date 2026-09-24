// Package payments turns payment-provider webhooks into ledger facts.
//
// Every provider implements the same two pure steps: Verify a webhook's
// signature, and Parse it into an Event: a set of idempotent, versioned
// upserts (payments, refunds, disputes, hints and visitor links). The ledger
// applies them in any order, any number of times, with the same result, so
// retries, reconciliation and `reprocess` can never double-count money.
//
// Money model (plan §5.4):
//   - A Payment is the provider's underlying charge (Stripe PaymentIntent,
//     Lemon Squeezy order or subscription invoice, Polar order, Paddle
//     transaction, Dodo payment). Revenue = amount paid excluding tax,
//     before fees.
//   - A Refund is one refund, or a cumulative "refunded so far" figure
//     (Cumulative); the ledger takes the larger of the two per payment, so
//     providers that report both are never summed twice.
//   - A lost Dispute removes the disputed amount.
//   - Hints add facts learned elsewhere (tax from a checkout session, the
//     visitor from checkout metadata) without needing the payment to exist
//     yet: out-of-order webhooks resolve themselves.
package payments

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Provider is one payment provider's webhook dialect.
type Provider interface {
	Name() string
	// Verify checks the webhook signature against the signing secret.
	Verify(h http.Header, body []byte, secret string, now time.Time) error
	// Parse normalises a verified webhook. Irrelevant event types return an
	// Event with no facts (still stored in the inbox for reprocessing).
	Parse(body []byte) (Event, error)
}

// Event is one normalised webhook.
type Event struct {
	Key  string // dedupe key: the provider's event id, or a derived one
	Type string
	At   int64 // event time (unix ms): newer facts win over older ones
	Test bool  // provider test/sandbox mode, when the payload says so

	Payments []Payment
	Hints    []Hint
	Refunds  []Refund
	Disputes []Dispute
	Links    []Link
	Aliases  []Alias
}

// Empty reports whether the event carries no facts.
func (e Event) Empty() bool {
	return len(e.Payments)+len(e.Hints)+len(e.Refunds)+len(e.Disputes)+len(e.Links)+len(e.Aliases) == 0
}

// Payment kinds.
const (
	KindOneTime      = "one_time"
	KindSubscription = "subscription" // first payment of a subscription
	KindRenewal      = "renewal"
)

// Payment is money received.
type Payment struct {
	ID             string
	PaidAt         int64 // unix ms
	Currency       string
	Gross          int64  // total charged, minor units, tax included
	Tax            *int64 // nil when this event doesn't know (a Hint may)
	CustomerID     string
	SubscriptionID string
	Email          string // used only to link identify()'d visitors; stored hashed
	Visitor        uint64
	Kind           string
}

// Hint attaches facts to a payment known by id.
type Hint struct {
	PaymentID      string
	Source         string // e.g. "checkout:cs_123": one row per source
	Tax            *int64
	Visitor        uint64
	CustomerID     string
	SubscriptionID string
	Kind           string // payment kind, when this source knows it (e.g. invoice billing reason)
}

// Alias says two ids name the same payment (a Stripe invoice and the
// PaymentIntent that paid it). Hints keyed by the alias reach the payment.
type Alias struct {
	Alias     string
	PaymentID string
}

// Refund statuses.
const (
	RefundSucceeded = "succeeded"
	RefundPending   = "pending"
	RefundFailed    = "failed"
)

// Refund is money given back.
type Refund struct {
	ID         string
	PaymentID  string
	Amount     int64 // minor units, tax included
	Currency   string
	Status     string
	At         int64
	Cumulative bool // Amount is the total refunded so far for the payment
}

// Dispute statuses.
const (
	DisputeOpen = "open"
	DisputeWon  = "won"
	DisputeLost = "lost"
)

// Dispute is a chargeback.
type Dispute struct {
	ID        string
	PaymentID string
	Amount    int64
	Currency  string
	Status    string
	At        int64
}

// Link ties a customer or subscription to the visitor who started it, so
// renewals and later purchases follow the original visitor.
type Link struct {
	Kind    string // "cus" or "sub"
	Key     string
	Visitor uint64
}

// Errors.
var (
	ErrSignature = errors.New("webhook signature does not match")
	ErrStale     = errors.New("webhook timestamp outside the allowed window")
)

// Tolerance is how old (or far in the future) a signed timestamp may be.
const Tolerance = 5 * time.Minute

// MetaVisitor is the checkout metadata key carrying the visitor id
// (trckable/server getIds() and the tracker's link decoration set it).
const MetaVisitor = "trckable_vid"

// cutPrefix takes "trckable_" off v.
func cutPrefix(v string) (string, bool) {
	return strings.CutPrefix(v, "trckable_")
}

// ParseVisitor decodes a trckable_vid value ("<id36>.<firstseen36>", a bare
// base-36 id, or "trckable_<id36>_<firstseen36>", the form link decoration
// uses where only [A-Za-z0-9_-] is allowed, e.g. Stripe client_reference_id).
// Zero means none.
func ParseVisitor(v string) uint64 {
	v = strings.TrimSpace(v)
	if rest, ok := cutPrefix(v); ok {
		v = strings.Replace(rest, "_", ".", 1)
	} else if strings.ContainsAny(v, "_-") {
		return 0 // someone else's reference id
	}
	if i := strings.IndexByte(v, '.'); i >= 0 {
		v = v[:i]
	}
	if v == "" || len(v) > 13 {
		return 0
	}
	id, err := strconv.ParseUint(v, 36, 64)
	if err != nil {
		return 0
	}
	return id
}

// strictVisitor reads a visitor from a field other tools also use (Stripe
// client_reference_id, Polar reference_id): only "trckable_…" values count,
// so someone's order number is never mistaken for a visitor.
func strictVisitor(v string) uint64 {
	if _, ok := cutPrefix(strings.TrimSpace(v)); !ok {
		return 0
	}
	return ParseVisitor(v)
}

// visitorFrom returns the first visitor id found in metadata-like maps:
// trckable_vid, or a trckable_-prefixed checkout-link parameter.
func visitorFrom(ms ...map[string]any) uint64 {
	for _, m := range ms {
		if s, ok := m[MetaVisitor].(string); ok {
			if v := ParseVisitor(s); v != 0 {
				return v
			}
		}
		for _, k := range []string{"reference_id", "metadata_trckable_vid"} { // checkout-link parameters
			if s, ok := m[k].(string); ok {
				if v := strictVisitor(s); v != 0 {
					return v
				}
			}
		}
	}
	return 0
}

// links builds customer/subscription links for a known visitor.
func links(visitor uint64, customer, subscription string) []Link {
	if visitor == 0 {
		return nil
	}
	var out []Link
	if customer != "" {
		out = append(out, Link{Kind: "cus", Key: customer, Visitor: visitor})
	}
	if subscription != "" {
		out = append(out, Link{Kind: "sub", Key: subscription, Visitor: visitor})
	}
	return out
}

func ptr(v int64) *int64 { return &v }

// Registry lists every supported provider by name.
var Registry = map[string]Provider{}

func register(p Provider) { Registry[p.Name()] = p }
