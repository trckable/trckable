package server

import "testing"

func TestLocalURLHost(t *testing.T) {
	for in, want := range map[string]string{":8080": "localhost:8080", "0.0.0.0:80": "localhost:80", "127.0.0.1:8787": "127.0.0.1:8787", "[::]:9000": "localhost:9000"} {
		if got := localURLHost(in); got != want {
			t.Errorf("localURLHost(%q) = %q, want %q", in, got, want)
		}
	}
}
