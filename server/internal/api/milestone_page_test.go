package api

import (
	"net/http/httptest"
	"testing"
)

// A shared link speaks the language it was shared in, else the visitor's, else English.
func TestPageLangPicksTheSharedOrTheVisitorsLanguage(t *testing.T) {
	for _, c := range []struct{ url, accept, want string }{
		{"/m/x", "", "en"},
		{"/m/x?lang=de", "fr", "de"},
		{"/m/x", "nl-NL,nl;q=0.9,en;q=0.8", "nl"},
		{"/m/x", "ja,fr;q=0.5", "fr"},
		{"/m/x?lang=xx", "de", "en"},
	} {
		r := httptest.NewRequest("GET", c.url, nil)
		r.Header.Set("Accept-Language", c.accept)
		if got := pageLang(r).code; got != c.want {
			t.Errorf("%s %q: %s, want %s", c.url, c.accept, got, c.want)
		}
	}
}
