package api

import (
	"fmt"
	"strings"
)

// placeholderHosts are the example names people type into Add a site to see
// what happens. A site under one of them would only ever be junk.
var placeholderHosts = map[string]bool{
	"example.com":    true,
	"example.net":    true,
	"example.org":    true,
	"test.com":       true,
	"demo.com":       true,
	"yourdomain.com": true,
	"yoursite.com":   true,
	"domain.com":     true,
}

// placeholderHost returns the bare host of what was typed (no scheme, www,
// path or port) and whether it is a placeholder. localhost, *.test, *.invalid
// and IPs are not: self-hosters use them.
func placeholderHost(domain string) (string, bool) {
	h := strings.ToLower(strings.TrimSpace(domain))
	if i := strings.Index(h, "://"); i >= 0 {
		h = h[i+3:]
	}
	if i := strings.IndexAny(h, "/?#"); i >= 0 {
		h = h[:i]
	}
	if i := strings.LastIndexByte(h, '@'); i >= 0 {
		h = h[i+1:]
	}
	if i := strings.LastIndexByte(h, ':'); i >= 0 && !strings.Contains(h[i:], "]") {
		h = h[:i]
	}
	h = strings.TrimPrefix(strings.TrimRight(h, "."), "www.")
	return h, placeholderHosts[h] || strings.HasSuffix(h, ".example")
}

func placeholderMessage(host string) string {
	return fmt.Sprintf("%s is a placeholder. Enter your own site's address.", host)
}
