package say

import "testing"

func TestWordsEveryLanguage(t *testing.T) {
	for _, c := range []struct {
		lang, number, money, up, down, same, fresh string
	}{
		{"en", "1,234,567", "$1,235", "up 20%", "down 20%", "about the same", "new"},
		{"de", "1.234.567", "1.235 $", "plus 20%", "minus 20%", "ungefähr gleich", "neu"},
		{"fr", "1 234 567", "1 235 $", "en hausse de 20%", "en baisse de 20%", "à peu près stable", "nouveau"},
		{"es", "1.234.567", "1.235 $", "sube 20%", "baja 20%", "casi igual", "nuevo"},
		{"it", "1.234.567", "1.235 $", "in aumento del 20%", "in calo del 20%", "più o meno uguale", "nuovo"},
		{"nl", "1.234.567", "$ 1.235", "omhoog 20%", "omlaag 20%", "ongeveer gelijk", "nieuw"},
	} {
		w := For(c.lang)
		if got := w.Number(1234567); got != c.number {
			t.Errorf("%s number %q, want %q", c.lang, got, c.number)
		}
		if got := w.Number(-1234); got != "-"+w.Number(1234) {
			t.Errorf("%s negative %q", c.lang, got)
		}
		if got := w.Money(123456, "USD", 2); got != c.money {
			t.Errorf("%s money %q, want %q", c.lang, got, c.money)
		}
		for _, m := range []struct {
			name      string
			cur, prev float64
			want      string
		}{
			{"up", 120, 100, c.up}, {"down", 80, 100, c.down}, {"flat", 100.3, 100, c.same},
			{"flat zero", 0, 0, c.same}, {"rounds to 0 up", 100.5, 100, c.same}, {"rounds to 0 down", 99.5, 100, c.same}, {"new", 5, 0, c.fresh},
		} {
			if got := w.Change(m.cur, m.prev); got != m.want {
				t.Errorf("%s change %s %q, want %q", c.lang, m.name, got, m.want)
			}
		}
	}
}

func TestWordsEdges(t *testing.T) {
	en := For("en")
	if For("xx").Code != "en" || For(" DE ").Code != "de" {
		t.Error("an unknown language is English; the code is read loosely")
	}
	if got := en.Change(100.4, 100); got != "about the same" {
		t.Errorf("below the flat threshold: %q", got)
	}
	if got := en.Money(100000, "CHF", 2); got != "CHF 1,000" {
		t.Errorf("chf %q", got)
	}
	if got := en.Money(1000, "XYZ", 0); got != "1,000 XYZ" {
		t.Errorf("no sign %q", got)
	}
	if got := en.MoneyFine(49, "USD", 2); got != "$0.49" {
		t.Errorf("fine %q", got)
	}
	if got := For("de").Percent(0.052); got != "5,2%" {
		t.Errorf("percent %q", got)
	}
	if got := en.Percent(0.45); got != "45%" {
		t.Errorf("percent %q", got)
	}
}
