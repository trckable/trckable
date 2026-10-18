package answers

import (
	"net/url"
	"strings"
)

// PagePath is the page a link points to, as the tracker stores page paths
// (ingest parsePageURL): escaped path, a closing slash trimmed except for "/",
// no query, no fragment. onSite says the link is to domain or a subdomain of
// it; sameHost says the host is exactly domain (after "www."), the only case
// whose path joins to the site's own pages.
func PagePath(rawURL, domain string) (path string, sameHost, onSite bool) {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return "", false, false
	}
	domain = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(domain)), "www.")
	host := strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
	if domain == "" {
		return "", false, false
	}
	sameHost = host == domain
	onSite = sameHost || strings.HasSuffix(host, "."+domain)
	path = u.EscapedPath()
	if path == "" {
		path = "/"
	}
	if len(path) > 1 {
		path = strings.TrimSuffix(path, "/")
	}
	return path, sameHost, onSite
}
