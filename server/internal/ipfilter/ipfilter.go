// Package ipfilter is the owner's list of addresses to leave out of the
// counts: single IPs and CIDR ranges, IPv4 or IPv6. The list is the owner's
// own setting and the only thing kept; a visitor's address is only ever
// compared against it, in memory, before it is used for anything else.
package ipfilter

import (
	"errors"
	"fmt"
	"net"
	"net/netip"
	"strings"
)

// Max is as many entries as one site can list.
const Max = 50

// ErrTooMany is returned for a list longer than Max.
var ErrTooMany = errors.New("50 excluded addresses is the limit")

// Parse reads one entry: an address ("203.0.113.7", "2001:db8::1") or a range
// ("203.0.113.0/24", "2001:db8::/32"). Bits past the prefix are cleared, so a
// range typed from a host address means the whole range.
func Parse(s string) (netip.Prefix, error) {
	s = strings.TrimSpace(s)
	if !strings.Contains(s, "/") {
		a, err := netip.ParseAddr(s)
		if err != nil || a.Zone() != "" {
			return netip.Prefix{}, fmt.Errorf("%q is not an IP address or a range like 203.0.113.0/24", s)
		}
		a = a.Unmap()
		return netip.PrefixFrom(a, a.BitLen()), nil
	}
	p, err := netip.ParsePrefix(s)
	if err != nil || p.Addr().Zone() != "" {
		return netip.Prefix{}, fmt.Errorf("%q is not an IP address or a range like 203.0.113.0/24", s)
	}
	if p.Addr().Is4In6() { // ::ffff:1.2.3.0/120 is the IPv4 range 1.2.3.0/24
		if p.Bits() < 96 {
			return netip.Prefix{}, fmt.Errorf("%q is too wide to mean one IPv4 range", s)
		}
		p = netip.PrefixFrom(p.Addr().Unmap(), p.Bits()-96)
	}
	return p.Masked(), nil
}

// String writes an entry the way the owner would: a bare address for a single
// host, the range otherwise.
func String(p netip.Prefix) string {
	if p.Bits() == p.Addr().BitLen() {
		return p.Addr().String()
	}
	return p.String()
}

// Clean checks a list as typed (blank lines skipped, repeats dropped) and
// returns its entries in their canonical spelling, or the first problem.
func Clean(lines []string) ([]string, error) {
	seen := map[netip.Prefix]bool{}
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		p, err := Parse(line)
		if err != nil {
			return nil, err
		}
		if seen[p] {
			continue
		}
		if len(out) == Max {
			return nil, ErrTooMany
		}
		seen[p] = true
		out = append(out, String(p))
	}
	return out, nil
}

// Prefixes reads a stored list. An entry that does not parse is skipped: a
// bad line must never stop the site from counting.
func Prefixes(lines []string) []netip.Prefix {
	out := make([]netip.Prefix, 0, len(lines))
	for _, line := range lines {
		if p, err := Parse(line); err == nil && len(out) < Max {
			out = append(out, p)
		}
	}
	return out
}

// Match reports whether ip (as text, with or without a port) is inside any
// of the prefixes. An address that cannot be read matches nothing.
func Match(list []netip.Prefix, ip string) bool {
	if len(list) == 0 {
		return false
	}
	a, ok := addr(ip)
	if !ok {
		return false
	}
	for _, p := range list {
		if p.Contains(a) {
			return true
		}
	}
	return false
}

func addr(s string) (netip.Addr, bool) {
	s = strings.TrimSpace(s)
	if a, err := netip.ParseAddr(s); err == nil {
		return a.WithZone("").Unmap(), true
	}
	if host, _, err := net.SplitHostPort(s); err == nil {
		if a, err := netip.ParseAddr(host); err == nil {
			return a.WithZone("").Unmap(), true
		}
	}
	return netip.Addr{}, false
}
