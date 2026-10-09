package payments

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// FuzzParse feeds every provider parser arbitrary bodies seeded with the
// ledger fixtures: parsers must never panic and must return sane facts.
func FuzzParse(f *testing.F) {
	files, err := filepath.Glob("../ledger/testdata/*.json")
	if err != nil {
		f.Fatal(err)
	}
	for _, file := range files {
		raw, err := os.ReadFile(file) //nolint:gosec // file comes from a fixed glob over the repo's own test fixtures
		if err != nil {
			f.Fatal(err)
		}
		var sc struct {
			Events []json.RawMessage `json:"events"`
		}
		if err := json.Unmarshal(raw, &sc); err != nil {
			f.Fatalf("%s: %v", file, err)
		}
		for _, e := range sc.Events {
			f.Add([]byte(e))
		}
	}
	f.Add([]byte(`{"data":{"object":null}}`))
	f.Add([]byte(`{"type":"order.paid","data":[]}`))
	f.Add([]byte("sale_id=gs_1&price=4900&currency=usd&url_params%5Btrckable_vid%5D=abc.d&refunded=true"))
	f.Add([]byte(`{"event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"C","status":"COMPLETED","amount":{"currency_code":"USD","value":"1e3"}}}`))
	f.Add([]byte(`{"event_type":"PAYMENT.SALE.REFUNDED","resource":{"amount":{"total":"-1","currency":"JPY"},"links":null}}`))
	f.Fuzz(func(t *testing.T, body []byte) {
		for name, p := range Registry {
			ev, err := p.Parse(body)
			if err != nil {
				continue
			}
			for _, x := range ev.Payments {
				if x.Gross <= 0 {
					t.Fatalf("%s: non-positive payment %+v", name, x)
				}
			}
		}
	})
}
