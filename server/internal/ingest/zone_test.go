package ingest

import (
	"net/http"
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
		geoSpy(h)
		h.Sites = fakeSites{"tkb_test": {ID: "tkb_test", Domain: "site.com", ProxyKey: "tkb_px_secret", NoCity: tc.noCity, ConsentFree: tc.free}}
		if w := proxied(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/","id":"a","v":"k3j2.m1a2b3","z":"`+tc.zone+`"}`, "tkb_px_secret"); w.Code != http.StatusAccepted {
			t.Fatalf("status %d", w.Code)
		}
		e, _ := lastEvent(t, l)
		if e.Timezone != tc.want {
			t.Fatalf("%+v: timezone %q", tc, e.Timezone)
		}
	}
}
