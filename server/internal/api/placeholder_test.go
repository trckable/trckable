package api

import "testing"

func TestPlaceholderHost(t *testing.T) {
	for _, in := range []string{
		"example.com", "EXAMPLE.org", "www.example.net", "https://www.example.com/pricing?x=1",
		"shop.example", "a.b.example", "test.com", "demo.com", "yourdomain.com", "yoursite.com", "domain.com", "example.com:8080",
	} {
		if _, ok := placeholderHost(in); !ok {
			t.Errorf("%q should be a placeholder", in)
		}
	}
	for _, in := range []string{
		"localhost", "app.localhost", "mysite.test", "x.invalid", "127.0.0.1", "10.0.0.5:3000",
		"myexample.com", "blog.example.com", "mytest.com", "example.co", "example", "",
	} {
		if h, ok := placeholderHost(in); ok {
			t.Errorf("%q (%q) should be allowed", in, h)
		}
	}
	if h, _ := placeholderHost("https://www.Example.com/"); h != "example.com" {
		t.Errorf("host = %q", h)
	}
}
