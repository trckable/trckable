package server

import (
	"strings"
	"testing"
	"time"
)

func TestSetupMailCarriesTheInstallLine(t *testing.T) {
	ev := setupMailEvent("tkb_abc", "shop.example", "https://stats.example", time.Now())
	line := `<script defer data-site="tkb_abc" data-domain="shop.example" src="https://stats.example/js/tkb_abc.js"></script>`
	if !strings.Contains(ev.Message, line) || ev.Email == nil || !strings.Contains(ev.Email.Text(), line) {
		t.Fatalf("the install line is missing: %q", ev.Message)
	}
	if !strings.Contains(ev.Email.Text(), "https://stats.example/shop.example") {
		t.Fatalf("no link to the setup: %q", ev.Email.Text())
	}
}
