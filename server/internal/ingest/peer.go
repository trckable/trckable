package ingest

import (
	"net"
	"net/http"
	"net/netip"
)

var carrierNAT = netip.MustParsePrefix("100.64.0.0/10")

// IsPrivateAddr says whether host is a loopback, private, link-local or
// carrier-grade NAT address: where a reverse proxy, a container network or a
// platform's internal router sits, not a visitor.
func IsPrivateAddr(host string) bool {
	a, err := netip.ParseAddr(host)
	if err != nil {
		return false
	}
	a = a.Unmap()
	return a.IsLoopback() || a.IsPrivate() || a.IsLinkLocalUnicast() || carrierNAT.Contains(a)
}

// SharedPeer says whether every visitor looks like the same address: the
// connection comes from a private or loopback peer (a proxy next to the
// server) and the address trckable resolved for the request is that very
// peer, because no forwarded header is trusted.
func SharedPeer(r *http.Request, resolved string) bool {
	peer, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		peer = r.RemoteAddr
	}
	return IsPrivateAddr(peer) && resolved == peer
}

// SawProxyHeaders says whether the request carries what a reverse proxy adds.
func SawProxyHeaders(r *http.Request) bool {
	for _, h := range []string{"X-Forwarded-For", "X-Real-IP", "Forwarded", "X-Forwarded-Proto", "X-Forwarded-Host"} {
		if r.Header.Get(h) != "" {
			return true
		}
	}
	return false
}
