package revenue

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/payments"
)

// detailsTTL is how long what a provider said about a customer is kept in
// memory. Names, emails and license keys are never written to the database:
// they are read live from the provider when someone opens them.
const detailsTTL = 10 * time.Minute

// maxDetails bounds the memory cache; the oldest entries make room.
const maxDetails = 2000

// noneTTL is how long a failed read, or a customer the provider does not have,
// is remembered, so a page of rows does not ask again and again.
const noneTTL = time.Minute

type detailsEntry struct {
	d        payments.Details
	licenses bool // the license keys were read too
	none     bool // the provider had nothing (a failure or no such customer): not asked again for a minute
	at       time.Time
}

type detailsCache struct {
	mu sync.Mutex
	m  map[string]detailsEntry
}

// get returns what is remembered: hit says there is an answer, found that it is a customer.
func (c *detailsCache) get(k string, licenses bool, now time.Time) (d payments.Details, found, hit bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[k]
	switch {
	case !ok:
		return d, false, false
	case e.none:
		return d, false, now.Sub(e.at) <= noneTTL
	case now.Sub(e.at) > detailsTTL, licenses && !e.licenses:
		return d, false, false
	}
	return e.d, true, true
}

func (c *detailsCache) put(k string, e detailsEntry) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.m == nil {
		c.m = map[string]detailsEntry{}
	}
	if len(c.m) >= maxDetails {
		for key, old := range c.m {
			if e.at.Sub(old.at) > detailsTTL {
				delete(c.m, key)
			}
		}
		for key := range c.m {
			if len(c.m) < maxDetails {
				break
			}
			delete(c.m, key)
		}
	}
	c.m[k] = e
}

// Details reads a customer from their payment provider, by the ledger's
// customer key. ok is false when there is nothing to read: the provider has
// no such capability, the key is not a provider customer id (an email hash, a
// single payment), or the connection is gone. withLicenses also reads the
// license keys. Kept in memory for ten minutes, never stored.
func (s *Service) Details(ctx context.Context, site, customerKey string, withLicenses bool) (d payments.Details, ok bool, err error) {
	provider, id, found := strings.Cut(customerKey, ":")
	if !found || id == "" {
		return d, false, nil
	}
	det, can := payments.Remotes[provider].(payments.Detailer)
	if !can {
		return d, false, nil
	}
	ck := site + "\x00" + customerKey
	if d, found, hit := s.details.get(ck, withLicenses, s.Now()); hit {
		return d, found, nil
	}
	var connID string
	if e := s.DB.QueryRowContext(ctx, `SELECT connection_id FROM pay_payments WHERE site_id = ? AND provider = ? AND customer_id = ? LIMIT 1`, site, provider, id).Scan(&connID); e != nil {
		return d, false, nil // not a provider customer id (an email hash, a single payment)
	}
	c, e := s.connection(ctx, connID, true)
	if e != nil || c.apiKey == "" || c.Provider != provider {
		return d, false, nil
	}
	d, err = det.CustomerDetails(ctx, c.apiKey, c.Mode == "test", id, withLicenses)
	if err != nil {
		s.details.put(ck, detailsEntry{none: true, at: s.Now()})
		var api *payments.APIError
		if errors.As(err, &api) && api.Status == 404 {
			return payments.Details{}, false, nil
		}
		return payments.Details{}, false, err
	}
	s.details.put(ck, detailsEntry{d: d, licenses: withLicenses, at: s.Now()})
	return d, true, nil
}
