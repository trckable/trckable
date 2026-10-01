// Package weburl checks the web addresses an owner types into settings, which
// end up in a response header (the sites a share link may be framed on) or in
// a page on the owner's own site (the cookie bar's privacy link). Only https
// is accepted, and http for this machine; anything else, such as javascript:,
// data: or a host carrying extra header syntax, is refused.
package weburl

import (
	"net"
	"net/url"
	"strconv"
	"strings"
)

// Origin returns raw as "scheme://host[:port]": a site's address with no
// path, query, fragment or credentials, https (http only for localhost), and
// a host made of plain DNS labels or an IP address.
func Origin(raw string) (string, bool) {
	u, ok := parse(raw)
	if !ok || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || strings.Contains(raw, "#") {
		return "", false
	}
	return u.Scheme + "://" + u.Host, true
}

// Link returns raw if it is a link a visitor's browser may follow: an https
// address (http only for localhost), or a path on the same site such as
// "/privacy". Credentials in the address are refused.
func Link(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" || hasControl(raw) {
		return "", false
	}
	if strings.HasPrefix(raw, "/") {
		if strings.HasPrefix(raw, "//") || strings.Contains(raw, `\`) { // "//host" and "/\host" leave the site
			return "", false
		}
		return raw, true
	}
	if _, ok := parse(raw); !ok {
		return "", false
	}
	return raw, true
}

// parse reads an absolute http(s) address and checks its scheme and host.
func parse(raw string) (*url.URL, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" || hasControl(raw) {
		return nil, false
	}
	u, err := url.Parse(raw)
	if err != nil || u.Opaque != "" || u.User != nil {
		return nil, false
	}
	host, ok := cleanHost(u.Host)
	if !ok {
		return nil, false
	}
	u.Host = host
	name := u.Hostname()
	switch u.Scheme {
	case "https":
	case "http":
		if name != "localhost" && name != "127.0.0.1" && name != "::1" {
			return nil, false
		}
	default:
		return nil, false
	}
	return u, true
}

// cleanHost accepts "name", "name:port", an IPv4 address or "[v6]" with an
// optional port, and returns it in lower case.
func cleanHost(h string) (string, bool) {
	var name, port string
	if strings.HasPrefix(h, "[") {
		end := strings.IndexByte(h, ']')
		if end < 0 {
			return "", false
		}
		name, port = h[1:end], h[end+1:]
		if port != "" && port[0] != ':' {
			return "", false
		}
		if ip := net.ParseIP(name); ip == nil || ip.To4() != nil {
			return "", false
		}
		name = "[" + strings.ToLower(name) + "]"
	} else if i := strings.LastIndexByte(h, ':'); i >= 0 {
		name, port = h[:i], h[i:]
		if !validName(name) {
			return "", false
		}
		name = strings.ToLower(name)
	} else {
		if !validName(h) {
			return "", false
		}
		name = strings.ToLower(h)
	}
	if port != "" {
		n, err := strconv.Atoi(port[1:])
		if err != nil || n < 1 || n > 65535 || port[1:] != strconv.Itoa(n) {
			return "", false
		}
	}
	return name + port, true
}

// validName is a host name of letters, digits and hyphens in dot-separated
// labels (internationalised names in their xn-- form), or an IPv4 address.
func validName(s string) bool {
	if s == "" || len(s) > 253 {
		return false
	}
	if ip := net.ParseIP(s); ip != nil {
		return ip.To4() != nil
	}
	for _, label := range strings.Split(s, ".") {
		if label == "" || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, c := range label {
			if (c < 'a' || c > 'z') && (c < 'A' || c > 'Z') && (c < '0' || c > '9') && c != '-' {
				return false
			}
		}
	}
	return true
}

func hasControl(s string) bool {
	for _, c := range s {
		if c <= ' ' || c == 0x7f {
			return true
		}
	}
	return false
}
