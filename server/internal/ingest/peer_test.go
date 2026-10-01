package ingest

import (
	"net/http/httptest"
	"testing"
)

func TestIsPrivateAddr(t *testing.T) {
	for addr, want := range map[string]bool{
		"127.0.0.1": true, "::1": true, "10.1.2.3": true, "172.17.0.1": true, "192.168.1.5": true,
		"fd00::1": true, "100.64.0.3": true, "169.254.1.1": true, "::ffff:10.0.0.1": true,
		"203.0.113.9": false, "8.8.8.8": false, "2001:db8::1": false, "": false, "nonsense": false,
	} {
		if got := IsPrivateAddr(addr); got != want {
			t.Errorf("IsPrivateAddr(%q) = %v, want %v", addr, got, want)
		}
	}
}

func TestSharedPeer(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "172.18.0.2:5555"
	if !SharedPeer(r, RemoteIP(r)) {
		t.Error("a private peer with no trusted header is shared")
	}
	if SharedPeer(r, "198.51.100.7") {
		t.Error("a trusted forwarded address tells visitors apart")
	}
	r.RemoteAddr = "198.51.100.7:5555"
	if SharedPeer(r, RemoteIP(r)) {
		t.Error("a public peer is a visitor")
	}
}
