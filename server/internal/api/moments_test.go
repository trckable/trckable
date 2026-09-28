package api

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/query"
)

// No money in the report (revenue hidden from this reader, the module off,
// nothing connected): no sale is a moment, whatever the buckets hold.
func TestMomentsNeverSlipInSales(t *testing.T) {
	res := &query.Result{Sales: []query.SaleBucket{{T: "2026-09-27T20:00", Count: 2, Amount: 4900, Channel: "Search"}}}
	if got := salesOf(res); len(got) != 0 {
		t.Fatalf("sales without money: %+v", got)
	}
	res.Money = &query.Money{Currency: "USD", Exponent: 2}
	if got := salesOf(res); len(got) != 1 || got[0].Amount != 4900 || got[0].Channel != "Search" || got[0].Kind != "sale" {
		t.Fatalf("got %+v", got)
	}
}

func TestBucketKey(t *testing.T) {
	if bucketKey("2026-09-27T20:00", "day") != "2026-09-27T00:00" || bucketKey("2026-09-27T20:00", "hour") != "2026-09-27T20:00" {
		t.Fatal("bucketKey")
	}
}

// The moments route over HTTP: the site's own notes come back as moments;
// only day and hour buckets; no other account's site; nobody signed out.
func TestMomentsRoute(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	ctx := context.Background()
	day := time.Now().UTC().Format("2006-01-02")
	if _, err := g.ctl.AddAnnotation(ctx, g.site, "", day, "Launched on the forum"); err != nil {
		t.Fatal(err)
	}
	url := g.srv.URL + "/api/v1/sites/" + g.site + "/moments?from=" + day + "&to=" + day
	code, _, body := get(t, owner, url+"&bucket=hour")
	if code != http.StatusOK || !strings.Contains(body, `"kind":"note"`) || !strings.Contains(body, "Launched on the forum") {
		t.Fatalf("hour: %d %s", code, body)
	}
	if strings.Contains(body, `"kind":"sale"`) || strings.Contains(body, "currency") {
		t.Fatalf("no payments connected, no money: %s", body)
	}
	if code, _, _ := get(t, owner, url+"&bucket=week"); code != http.StatusBadRequest {
		t.Fatalf("week: %d", code)
	}
	if code, _, _ := get(t, client(), url+"&bucket=day"); code != http.StatusUnauthorized {
		t.Fatalf("signed out: %d", code)
	}
	acc, _ := g.ctl.CreateAccount(ctx)
	theirs, _ := g.ctl.CreateSite(ctx, acc, "theirs.com", "")
	if code, _, _ := get(t, owner, g.srv.URL+"/api/v1/sites/"+theirs+"/moments?bucket=day"); code != http.StatusNotFound {
		t.Fatalf("another account's site: %d", code)
	}
}
