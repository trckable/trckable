package ingest

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestRefusedHostnamesAreCountedByName(t *testing.T) {
	h, _ := newHandler(t)
	post(h, `{"s":"tkb_test","k":"pv","u":"https://other.com/a"}`, chromeUA)
	post(h, `{"s":"tkb_test","k":"pv","u":"https://www.other.com/b"}`, chromeUA)
	post(h, `{"s":"tkb_test","k":"pv","u":"https://Staging.Other.com:8080/c"}`, chromeUA)
	post(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/"}`, chromeUA) // listed: not counted
	got := map[string]uint64{}
	for _, r := range h.Hosts.Drain() {
		got[r.Site+" "+r.Host] = r.N
	}
	if len(got) != 2 || got["tkb_test other.com"] != 2 || got["tkb_test staging.other.com"] != 1 {
		t.Fatalf("counted %v", got)
	}
	if len(h.Hosts.Drain()) != 0 {
		t.Fatal("drained twice")
	}
}

func TestRefusedHostnamesAreBounded(t *testing.T) {
	var c HostCounts
	at := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	for i := 0; i < 100; i++ {
		c.Add("tkb_a", fmt.Sprintf("h%d.example", i), at)
	}
	c.Add("tkb_a", "h0.example", at) // one already kept still counts
	c.Add("tkb_a", "bad host!", at)
	c.Add("tkb_a", strings.Repeat("a", hostMaxLen+1), at)
	c.Add("tkb_a", "", at)
	rows := c.Drain()
	if len(rows) != hostsPerSiteDay {
		t.Fatalf("kept %d names, want %d", len(rows), hostsPerSiteDay)
	}
	for _, r := range rows {
		if r.Host == "h0.example" && r.N != 2 {
			t.Fatalf("h0 counted %d", r.N)
		}
	}
	c.Restore(rows)
	c.Add("tkb_a", "new.example", at)
	if got := c.Drain(); len(got) != hostsPerSiteDay {
		t.Fatalf("after restore kept %d", len(got))
	}
}
