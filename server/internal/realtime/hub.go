// Package realtime fans committed events out to live dashboard streams.
// Publishing never blocks the writer: a slow subscriber just misses events.
package realtime

import (
	"strconv"
	"sync"

	"github.com/trckable/trckable/server/internal/event"
)

// Live is the slim, privacy-safe shape sent to dashboards.
type Live struct {
	Kind    string `json:"kind"` // pageview | goal | sale
	TS      int64  `json:"ts"`
	Path    string `json:"path,omitempty"`
	Goal    string `json:"goal,omitempty"`
	Channel string `json:"channel,omitempty"`
	Ref     string `json:"referrer,omitempty"`
	Country string `json:"country,omitempty"`
	City    string `json:"city,omitempty"`
	Device  string `json:"device,omitempty"`
	Browser string `json:"browser,omitempty"`
	// Visitor is the pseudonymous id, so the dashboard can open this person's
	// journey. It is derived from a daily-rotating salted hash and never
	// contains an IP, an email or anything a visitor typed.
	Visitor string `json:"visitor,omitempty"`
	// A sale carries what arrived and nothing about who paid: no email, no
	// customer, not even which visit earned it — that is worked out later.
	Amount   int64  `json:"amount,omitempty"`
	Currency string `json:"currency,omitempty"`
	Exponent int    `json:"exponent,omitempty"`
}

// Hub routes events to per-site subscribers.
type Hub struct {
	mu   sync.RWMutex
	subs map[string]map[chan Live]struct{}
}

func New() *Hub { return &Hub{subs: map[string]map[chan Live]struct{}{}} }

// Subscribe returns a channel of the site's live events and a cancel func.
func (h *Hub) Subscribe(site string) (<-chan Live, func()) {
	ch := make(chan Live, 64)
	h.mu.Lock()
	if h.subs[site] == nil {
		h.subs[site] = map[chan Live]struct{}{}
	}
	h.subs[site][ch] = struct{}{}
	h.mu.Unlock()
	return ch, func() {
		h.mu.Lock()
		delete(h.subs[site], ch)
		h.mu.Unlock()
	}
}

// Publish sends committed events to subscribers (called by the writer).
func (h *Hub) Publish(evs []event.Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if len(h.subs) == 0 {
		return
	}
	for i := range evs {
		e := &evs[i]
		subs := h.subs[e.Site]
		if len(subs) == 0 || e.Kind == event.KindEngagement {
			continue
		}
		l := Live{TS: e.TS, Visitor: strconv.FormatUint(e.Visitor, 36), Path: e.Path, Channel: e.Channel, Ref: e.RefHost, Country: e.Country, City: e.City, Device: e.Device, Browser: e.Browser}
		if e.Kind == event.KindGoal {
			l.Kind, l.Goal = "goal", e.Goal
		} else {
			l.Kind = "pageview"
		}
		for ch := range subs {
			select {
			case ch <- l:
			default: // subscriber too slow: drop rather than block ingest
			}
		}
	}
}

// PublishSale announces a payment the ledger has just recorded.
func (h *Hub) PublishSale(site string, ts, amount int64, currency string, exponent int) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	l := Live{Kind: "sale", TS: ts, Amount: amount, Currency: currency, Exponent: exponent}
	for ch := range h.subs[site] {
		select {
		case ch <- l:
		default: // a slow dashboard misses a coin; the ledger does not
		}
	}
}
