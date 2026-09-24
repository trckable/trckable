package server

import (
	"bytes"
	"strings"
	"testing"
)

func TestServerLogNamesNoAddress(t *testing.T) {
	var b bytes.Buffer
	l := serverLog(&b)
	for _, line := range []string{
		"http: panic serving 79.106.125.62:51234: boom",
		"http: panic serving [2a02:c207:2034:6157::1]:443: boom",
		"http: TLS handshake error from 2001:db8::1: EOF",
	} {
		l.Print(line)
	}
	out := b.String()
	for _, ip := range []string{"79.106.125.62", "2a02:c207", "2001:db8"} {
		if strings.Contains(out, ip) {
			t.Fatalf("an address reached the log: %s", out)
		}
	}
	if strings.Count(out, "[address]") != 3 || !strings.Contains(out, "boom") {
		t.Fatalf("the rest of the line must stay: %s", out)
	}
}
