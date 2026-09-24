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
	files, _ := filepath.Glob("../ledger/testdata/*.json")
	for _, file := range files {
		raw, _ := os.ReadFile(file)
		var sc struct {
			Events []json.RawMessage `json:"events"`
		}
		json.Unmarshal(raw, &sc)
		for _, e := range sc.Events {
			f.Add([]byte(e))
		}
	}
	f.Add([]byte(`{"data":{"object":null}}`))
	f.Add([]byte(`{"type":"order.paid","data":[]}`))
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
