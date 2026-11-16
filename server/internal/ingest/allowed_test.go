package ingest

import (
	"testing"
	"time"
)

// A listed hostname (and its subdomains) is accepted besides the site's domain; any other is refused.
func TestHostAllowedHonoursTheAllowedList(t *testing.T) {
	s := Site{Domain: "site.com", Allowed: []string{"staging.other.com", "old.example"}}
	now := time.Now()
	for host, want := range map[string]bool{
		"site.com": true, "blog.site.com": true, "staging.other.com": true, "a.staging.other.com": true,
		"old.example": true, "other.com": false, "evilold.example": false, "elsewhere.org": false,
	} {
		if got := hostAllowed(host, s, false, now); got != want {
			t.Errorf("%s: %v, want %v", host, got, want)
		}
	}
}
