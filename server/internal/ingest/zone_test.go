package ingest

import (
	"net/http"
	"strings"
	"testing"
)

// The time zone is kept with region and city: a site that drops them, or
// keeps no cookie, never stores it. Anything that is not a zone name is dropped.
func TestTimezoneFollowsRegionAndCity(t *testing.T) {
	for _, tc := range []struct {
		noCity, free bool
		zone, want   string
	}{
		{false, false, "Europe/Berlin", "Europe/Berlin"},
		{false, false, "America/Argentina/Buenos_Aires", "America/Argentina/Buenos_Aires"},
		{false, false, "UTC", "UTC"},
		{false, false, "Europe/Berlin<script>", ""},
		{false, false, "Berlin", ""},
		{true, false, "Europe/Berlin", ""},
		{false, true, "Europe/Berlin", ""},
	} {
		h, l := newHandler(t)
		h.Geo = func(string) (string, string, string, string) { return "AL", "Tirana", "Tirana", tc.zone }
		h.Sites = fakeSites{"tkb_test": {ID: "tkb_test", Domain: "site.com", ProxyKey: "tkb_px_secret", NoCity: tc.noCity, ConsentFree: tc.free}}
		if w := proxied(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/","id":"a","v":"k3j2.m1a2b3","x":1}`, "tkb_px_secret"); w.Code != http.StatusAccepted {
			t.Fatalf("status %d", w.Code)
		}
		e, _ := lastEvent(t, l)
		if e.Timezone != tc.want {
			t.Fatalf("%+v: timezone %q", tc, e.Timezone)
		}
	}
}

// The provider's name follows the same switch as region and city, and is
// kept tidy: no control characters, one space between words, at most 64 bytes.
func TestNetworkFollowsRegionAndCity(t *testing.T) {
	long := strings.Repeat("ä", 60)
	for _, tc := range []struct {
		noCity, free bool
		name, want   string
	}{
		{false, false, "Deutsche Telekom AG", "Deutsche Telekom AG"},
		{false, false, "  Reliance\tJio \x00 Infocomm  ", "Reliance Jio Infocomm"},
		{false, false, long, strings.Repeat("ä", 32)},
		{false, false, "", ""},
		{true, false, "Deutsche Telekom AG", ""},
		{false, true, "Deutsche Telekom AG", ""},
	} {
		h, l := newHandler(t)
		h.Geo = func(string) (string, string, string, string) { return "DE", "", "", "" }
		h.Network = func(string, bool) (bool, string) { return false, tc.name }
		h.Sites = fakeSites{"tkb_test": {ID: "tkb_test", Domain: "site.com", ProxyKey: "tkb_px_secret", NoCity: tc.noCity, ConsentFree: tc.free}}
		if w := proxied(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/","id":"a","v":"k3j2.m1a2b3","x":1}`, "tkb_px_secret"); w.Code != http.StatusAccepted {
			t.Fatalf("status %d", w.Code)
		}
		e, _ := lastEvent(t, l)
		if e.Network != tc.want {
			t.Fatalf("%+v: network %q", tc, e.Network)
		}
	}
}
