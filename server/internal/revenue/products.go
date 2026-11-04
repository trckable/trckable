package revenue

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/ledger"
	"github.com/trckable/trckable/server/internal/payments"
)

// productTTL is how long a product's name is remembered; a product that could
// not be read is asked for again after noneTTL.
const productTTL = 24 * time.Hour

// productTimeout bounds one read of a product, productBudget all the reads of
// one pass, and productsPerPass how many different products Process asks for:
// the rest are named by a later pass. The one-time rebuild has no count cap.
// None of it runs under the ledger lock.
const (
	productTimeout  = 4 * time.Second
	productBudget   = 10 * time.Second
	productsPerPass = 40
)

// productKey is one product of one connection (a name belongs to the account
// whose key read it).
type productKey struct{ conn, id string }

type productEntry struct {
	name string // empty: the provider had no name, or could not be asked
	at   time.Time
}

type productCache struct {
	mu sync.Mutex
	m  map[productKey]productEntry
}

func (c *productCache) get(k productKey, now time.Time) (name string, hit bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[k]
	switch {
	case !ok:
		return "", false
	case e.name == "" && now.Sub(e.at) > noneTTL, now.Sub(e.at) > productTTL:
		return "", false
	}
	return e.name, true
}

func (c *productCache) put(k productKey, e productEntry) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.m == nil {
		c.m = map[productKey]productEntry{}
	}
	if len(c.m) >= maxDetails {
		clear(c.m)
	}
	c.m[k] = e
}

// wantProducts adds to asks the products a stored notice names only by id.
func wantProducts(asks map[productKey]bool, sc ledger.Scope, body []byte) {
	reg, ok := payments.Registry[sc.Provider]
	if !ok {
		return
	}
	ev, err := reg.Parse(body)
	if err != nil {
		return
	}
	for _, p := range ev.Payments {
		if p.Product == "" && p.ProductID != "" {
			asks[productKey{sc.Connection, p.ProductID}] = true
		}
	}
}

// productNames reads the name of each asked product once, from the cache or
// the provider with the connection's own key. A failure leaves the name empty
// and is remembered for a minute: the payment is stored without a product, and
// nothing waits on it. Call it before the ledger lock is taken. max caps the
// reads (0: no cap); the whole call stops after productBudget.
func (s *Service) productNames(ctx context.Context, asks map[productKey]bool, max int) map[productKey]string {
	ctx, stop := context.WithTimeout(ctx, productBudget)
	defer stop()
	names := map[productKey]string{}
	conns := map[string]Connection{}
	reads := 0
	for k := range asks {
		if name, hit := s.products.get(k, s.Now()); hit {
			names[k] = name
			continue
		}
		c, seen := conns[k.conn]
		if !seen {
			var err error
			if c, err = s.connection(ctx, k.conn, true); err != nil {
				c = Connection{}
			}
			conns[k.conn] = c
		}
		namer, can := payments.Remotes[c.Provider].(payments.Namer)
		if !can || c.apiKey == "" || (max > 0 && reads >= max) || ctx.Err() != nil {
			continue
		}
		reads++
		rc, cancel := context.WithTimeout(ctx, productTimeout)
		name, err := namer.ProductName(rc, c.apiKey, c.Mode == "test", k.id)
		cancel()
		if err != nil {
			slog.Debug("payments: couldn't read a product name", "provider", c.Provider, "err", err)
			name = ""
		}
		s.products.put(k, productEntry{name: name, at: s.Now()})
		names[k] = name
	}
	return names
}

// fillProducts gives the payments of an event the names read for their ids.
func fillProducts(ev *payments.Event, conn string, names map[productKey]string) {
	for i := range ev.Payments {
		p := &ev.Payments[i]
		if p.Product == "" && p.ProductID != "" {
			p.Product = payments.ProductName(names[productKey{conn, p.ProductID}])
		}
	}
}

// pendingProductNames reads the product names the next batch of waiting inbox
// rows needs, without the ledger lock.
func (s *Service) pendingProductNames(ctx context.Context) map[productKey]string {
	rows, err := s.DB.QueryContext(ctx, `SELECT i.body, c.provider, c.id FROM pay_inbox i
		JOIN pay_connections c ON c.id = i.connection_id WHERE i.processed_at IS NULL ORDER BY i.id LIMIT 200`)
	if err != nil {
		return nil
	}
	asks := map[productKey]bool{}
	for rows.Next() {
		var body []byte
		var sc ledger.Scope
		if rows.Scan(&body, &sc.Provider, &sc.Connection) == nil {
			wantProducts(asks, sc, body)
		}
	}
	rows.Close()
	return s.productNames(ctx, asks, productsPerPass)
}
