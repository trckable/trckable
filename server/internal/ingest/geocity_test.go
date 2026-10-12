package ingest

import (
	"net/http"
	"testing"
)

// "The country is always recorded; region and city are yours to choose": with
// the switch off the region and the city are never stored, the country stays.
func TestRegionAndCityFollowTheSwitchCountryAlwaysStays(t *testing.T) {
	for _, tc := range []struct {
		noCity       bool
		region, city string
	}{
		{false, "Tirana", "Tirana"},
		{true, "", ""},
	} {
		h, l := newHandler(t)
		geoSpy(h)
		h.Sites = fakeSites{"tkb_test": {ID: "tkb_test", Domain: "site.com", ProxyKey: "tkb_px_secret", NoCity: tc.noCity}}
		if w := proxied(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/","id":"a","v":"k3j2.m1a2b3"}`, "tkb_px_secret"); w.Code != http.StatusAccepted {
			t.Fatalf("status %d", w.Code)
		}
		e, _ := lastEvent(t, l)
		if e.Country != "AL" || e.Region != tc.region || e.City != tc.city {
			t.Fatalf("noCity=%v: country %q region %q city %q", tc.noCity, e.Country, e.Region, e.City)
		}
	}
}
