package api

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"testing"
	"time"
)

// The refunds route lists the payments paid back in the period, newest first,
// with how many and how much, and how many in the 90 days before the period
// ends. It never names the payment.
func TestRefundsRoute(t *testing.T) {
	o := newGolden(t)
	o.sale("ord_old", time.Date(2026, 9, 10, 15, 0, 0, 0, time.UTC), 5, 5000)
	o.sale("ord_new", time.Date(2026, 9, 12, 9, 0, 0, 0, time.UTC), 6, 3000)
	o.sale("ord_kept", time.Date(2026, 9, 12, 10, 0, 0, 0, time.UTC), 7, 1200)
	refund := func(id, pay string, at time.Time, amount int64) {
		o.webhook(fmt.Sprintf(`{"id":"evt_%s","type":"refund","at":%d,"refund":{"id":"%s","payment_id":"%s","amount":%d,"currency":"usd"}}`, id, at.Unix(), id, pay, amount))
	}
	refund("re_1", "ord_old", time.Date(2026, 9, 21, 8, 0, 0, 0, time.UTC), 2000)
	refund("re_2", "ord_new", time.Date(2026, 8, 1, 8, 0, 0, 0, time.UTC), 3000) // before the period, inside 90 days

	type body struct {
		Refunds []struct {
			ID     string `json:"id"`
			Amount int64  `json:"amount"`
			Kind   string `json:"kind"`
		} `json:"refunds"`
		Count    int    `json:"count"`
		Amount   int64  `json:"amount"`
		Count90  int    `json:"count_90d"`
		Currency string `json:"currency"`
	}
	read := func(q string) (b body, raw string) {
		res, err := o.c.Get(o.base + "/refunds?" + q)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		out, _ := io.ReadAll(res.Body)
		if res.StatusCode != 200 {
			t.Fatalf("refunds %s: %d %s", q, res.StatusCode, out)
		}
		if err := json.Unmarshal(out, &b); err != nil {
			t.Fatal(err)
		}
		return b, string(out)
	}

	got, raw := read("from=2026-09-15&to=2026-09-22&tz=UTC")
	if got.Count != 1 || got.Amount != 2000 || len(got.Refunds) != 1 || got.Refunds[0].Amount != 2000 || got.Refunds[0].Kind != "one_time" {
		t.Fatalf("the week: %+v", got)
	}
	if got.Count90 != 2 || got.Currency != "USD" {
		t.Fatalf("90 days: %+v", got)
	}
	if strings.Contains(raw, "ord_old") || strings.Contains(raw, "re_1") {
		t.Fatalf("the provider's ids leaked: %s", raw)
	}
	filtered, raw := read("from=2026-09-15&to=2026-09-22&tz=UTC&f=channel:AI")
	if filtered.Count != 0 || !strings.Contains(raw, `"filtered":true`) || !strings.Contains(raw, `"refunds":[]`) {
		t.Fatalf("a refund belongs to no visit, so a visit filter gets an empty answer that says so: %s", raw)
	}
	quiet, raw := read("from=2026-09-01&to=2026-09-05&tz=UTC")
	if quiet.Count != 0 || quiet.Amount != 0 || !strings.Contains(raw, `"refunds":[]`) {
		t.Fatalf("a quiet period is an empty list: %s", raw)
	}
	wide, _ := read("from=2026-07-25&to=2026-09-22&tz=UTC&n=1")
	if wide.Count != 2 || len(wide.Refunds) != 1 || wide.Refunds[0].Amount != 2000 {
		t.Fatalf("n caps the list, newest first: %+v", wide)
	}
}
