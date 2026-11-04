package payments

import (
	"context"
	"net/http"
	"testing"
)

// A Dodo customer with one license key activated on two devices: the name and
// email, the key's last four characters only, and the activations in order.
func TestDodoCustomerDetails(t *testing.T) {
	noWait(t)
	f := newFake(t, func(w http.ResponseWriter, r *http.Request, _ []byte) {
		switch {
		case r.URL.Path == "/customers/cus_1":
			jsonAnswer(w, 200, `{"customer_id":"cus_1","name":"Ada Lovelace","email":"ada@example.com"}`)
		case r.URL.Path == "/license_keys" && r.URL.Query().Get("customer_id") == "cus_1":
			jsonAnswer(w, 200, `{"items":[{"id":"lic_1","key":"AAAA-BBBB-CCCC-D3F9","status":"active","activations_limit":3,"instances_count":2,"created_at":"2026-10-01T10:00:00Z","expires_at":null}]}`)
		case r.URL.Path == "/license_key_instances" && r.URL.Query().Get("license_key_id") == "lic_1":
			jsonAnswer(w, 200, `{"items":[{"id":"i2","name":"b1c2","created_at":"2026-10-05T10:00:00Z"},{"id":"i1","name":"a9f3","created_at":"2026-10-02T10:00:00Z"}]}`)
		default:
			jsonAnswer(w, 404, `{"message":"not found"}`)
		}
	})
	api := &DodoAPI{TestURL: f.srv.URL}
	ctx := context.Background()

	d, err := api.CustomerDetails(ctx, "k", true, "cus_1", false)
	if err != nil || d.Name != "Ada Lovelace" || d.Email != "ada@example.com" || len(d.Licenses) != 0 {
		t.Fatalf("name only: %+v %v", d, err)
	}
	if f.called("GET /license_keys") != 0 {
		t.Fatal("the license keys were read for a name")
	}

	d, err = api.CustomerDetails(ctx, "k", true, "cus_1", true)
	if err != nil || len(d.Licenses) != 1 {
		t.Fatalf("with licenses: %+v %v", d, err)
	}
	l := d.Licenses[0]
	if l.Last4 != "D3F9" || l.Status != LicenseActive || l.Used != 2 || l.Limit != 3 || len(l.Activation) != 2 || l.Activation[0] > l.Activation[1] {
		t.Fatalf("license: %+v", l)
	}

	if _, err := api.CustomerDetails(ctx, "k", true, "cus_gone", false); statusOf(err) != 404 {
		t.Fatalf("unknown customer: %v", err)
	}
	if _, ok := Remotes["stripe"].(Detailer); ok {
		t.Fatal("stripe has no details capability yet")
	}
}
