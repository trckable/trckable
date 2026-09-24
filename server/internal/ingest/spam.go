package ingest

import (
	_ "embed"
	"strings"
)

// Referrer spam: sites that fake visits so their name turns up in analytics
// reports, hoping someone clicks it. The list is Matomo's community list
// (github.com/matomo-org/referrer-spam-list, public domain), embedded so a
// spam referrer is dropped without asking anyone. Refresh it with
// `go generate ./internal/ingest`.
//
//go:generate sh -c "curl -sfL https://raw.githubusercontent.com/matomo-org/referrer-spam-list/master/spammers.txt -o spammers.txt"
//go:embed spammers.txt
var spammersTxt string

var spammers = func() map[string]struct{} {
	m := make(map[string]struct{}, 2500)
	for _, l := range strings.Split(spammersTxt, "\n") {
		if l = strings.ToLower(strings.TrimSpace(l)); l != "" && !strings.HasPrefix(l, "#") {
			m[l] = struct{}{}
		}
	}
	return m
}()

// isSpam reports whether a referrer host, or any domain above it, is on the
// list: spam arrives as sub.spam-site.com as often as spam-site.com.
func isSpam(host string) bool {
	host = strings.TrimPrefix(strings.ToLower(host), "www.")
	for host != "" {
		if _, ok := spammers[host]; ok {
			return true
		}
		i := strings.IndexByte(host, '.')
		if i < 0 {
			return false
		}
		host = host[i+1:]
	}
	return false
}
