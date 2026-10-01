package weburl

import "testing"

func TestOrigin(t *testing.T) {
	good := map[string]string{
		"https://example.com":           "https://example.com",
		"https://Example.COM/":          "https://example.com",
		"https://app.example.com:8443":  "https://app.example.com:8443",
		"http://localhost:3000":         "http://localhost:3000",
		"http://127.0.0.1":              "http://127.0.0.1",
		"http://[::1]:5173":             "http://[::1]:5173",
		"https://xn--bcher-kva.example": "https://xn--bcher-kva.example",
	}
	for in, want := range good {
		if got, ok := Origin(in); !ok || got != want {
			t.Errorf("Origin(%q) = %q, %v; want %q", in, got, ok, want)
		}
	}
	for _, in := range []string{
		"", "example.com", "ftp://example.com", "javascript:alert(1)", "data:text/html,x", "//example.com",
		"http://example.com", "http://localhost.evil.com", "https://example.com/path", "https://example.com?x=1", "https://example.com#x",
		"https://user@example.com", "https://user:pw@example.com",
		"https://a.com;sandbox", "https://a.com 'unsafe-inline'", "https://a.com,https://b.com", "https://*.example.com",
		"https://a.com'", "https://a.com\nX-Evil: 1", "https://a_b.com", "https://-a.com", "https://a..com",
		"https://example.com:0", "https://example.com:99999", "https://example.com:08", "https://example.com:",
		"https://bücher.example", "https://[::1", "https://[2001:db8::1]x", "https://exa%6dple.com",
	} {
		if got, ok := Origin(in); ok {
			t.Errorf("Origin(%q) = %q, want a refusal", in, got)
		}
	}
}

func TestLink(t *testing.T) {
	for _, in := range []string{
		"https://example.com/privacy", "https://example.com/privacy?lang=de#cookies", "http://localhost:8080/p", "/datenschutz", "/privacy?x=1",
	} {
		if got, ok := Link(in); !ok || got != in {
			t.Errorf("Link(%q) = %q, %v; want it kept", in, got, ok)
		}
	}
	for _, in := range []string{
		"", "javascript:alert(1)", "JavaScript:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "data:text/html;base64,PHNjcmlwdD4=",
		"vbscript:x", "file:///etc/passwd", "http://example.com/privacy", "//evil.example/x", `/\evil.example`, "privacy", "mailto:a@b.c",
		"https://user:pw@example.com/p", "https:example.com", "https://",
	} {
		if got, ok := Link(in); ok || got != "" {
			t.Errorf("Link(%q) = %q, %v; want an empty refusal", in, got, ok)
		}
	}
}
