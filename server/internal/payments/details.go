package payments

import (
	"context"
	"net/url"
	"sort"
)

// Detailer is an optional capability of a provider's API: what the provider
// itself knows about one customer (their name and email, and the license keys
// they hold), read live when someone opens them. A provider that lacks it is
// simply not a Detailer, and the dashboard shows nothing extra for it.
type Detailer interface {
	// CustomerDetails reads one customer. withLicenses also reads their
	// license keys, which costs more calls than the name alone.
	CustomerDetails(ctx context.Context, key string, test bool, customerID string, withLicenses bool) (Details, error)
}

// Details is one customer as their provider knows them.
type Details struct {
	Name     string
	Email    string
	Licenses []License
}

// License is one license key a customer holds. The key itself is never kept,
// only its last four characters.
type License struct {
	Last4      string
	Status     string  // active, disabled or expired
	Used       int     // activations in use
	Limit      int     // the most allowed; 0 = no limit
	CreatedAt  int64   // unix ms: when the key was issued (the purchase)
	ExpiresAt  int64   // unix ms, 0 = never
	Activation []int64 // unix ms of each current activation, in order
}

// License statuses.
const (
	LicenseActive   = "active"
	LicenseDisabled = "disabled"
	LicenseExpired  = "expired"
)

func last4(s string) string {
	r := []rune(s)
	if len(r) <= 4 {
		return string(r)
	}
	return string(r[len(r)-4:])
}

// CustomerDetails reads a Dodo customer, and with withLicenses their license
// keys and the activations of each. A failure reading the keys leaves the
// name in place: the name is the part that is wanted most often.
func (a *DodoAPI) CustomerDetails(ctx context.Context, key string, test bool, customerID string, withLicenses bool) (Details, error) {
	var c struct {
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	if err := call(ctx, "GET", a.base(test)+"/customers/"+url.PathEscape(customerID), dodoHdr(key), nil, &c); err != nil {
		return Details{}, dodoProblem(ctx, err, test)
	}
	d := Details{Name: c.Name, Email: c.Email}
	if !withLicenses {
		return d, nil
	}
	var keys struct {
		Items []struct {
			ID               string `json:"id"`
			Key              string `json:"key"`
			Status           string `json:"status"`
			ActivationsLimit *int   `json:"activations_limit"`
			InstancesCount   int    `json:"instances_count"`
			CreatedAt        string `json:"created_at"`
			ExpiresAt        string `json:"expires_at"`
		} `json:"items"`
	}
	q := url.Values{"customer_id": {customerID}, "page_size": {"100"}}
	if err := call(ctx, "GET", a.base(test)+"/license_keys?"+q.Encode(), dodoHdr(key), nil, &keys); err != nil {
		return d, nil
	}
	for _, k := range keys.Items {
		l := License{Last4: last4(k.Key), Status: k.Status, Used: k.InstancesCount, CreatedAt: rfc3339ms(k.CreatedAt), ExpiresAt: rfc3339ms(k.ExpiresAt)}
		if k.ActivationsLimit != nil {
			l.Limit = *k.ActivationsLimit
		}
		if k.InstancesCount > 0 {
			var inst struct {
				Items []struct {
					CreatedAt string `json:"created_at"`
				} `json:"items"`
			}
			iq := url.Values{"license_key_id": {k.ID}, "page_size": {"100"}}
			if err := call(ctx, "GET", a.base(test)+"/license_key_instances?"+iq.Encode(), dodoHdr(key), nil, &inst); err == nil {
				for _, i := range inst.Items {
					l.Activation = append(l.Activation, rfc3339ms(i.CreatedAt))
				}
				sort.Slice(l.Activation, func(i, j int) bool { return l.Activation[i] < l.Activation[j] })
			}
		}
		d.Licenses = append(d.Licenses, l)
	}
	sort.SliceStable(d.Licenses, func(i, j int) bool { return d.Licenses[i].CreatedAt > d.Licenses[j].CreatedAt })
	return d, nil
}

var _ Detailer = (*DodoAPI)(nil)

// Namer is an optional capability of a provider's API: the name of a product
// from its id, for providers whose payments name only the id.
type Namer interface {
	ProductName(ctx context.Context, key string, test bool, productID string) (string, error)
}

// ProductName reads a Dodo product's name.
func (a *DodoAPI) ProductName(ctx context.Context, key string, test bool, productID string) (string, error) {
	var p struct {
		Name string `json:"name"`
	}
	if err := call(ctx, "GET", a.base(test)+"/products/"+url.PathEscape(productID), dodoHdr(key), nil, &p); err != nil {
		return "", dodoProblem(ctx, err, test)
	}
	return ProductName(p.Name), nil
}

var _ Namer = (*DodoAPI)(nil)
