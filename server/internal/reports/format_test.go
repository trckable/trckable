package reports

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/trckable/trckable/server/internal/moments"
)

// The dashboard's lib/format.ts writes the same figures; both are held to
// testdata/format.json (dashboard/src/lib/format.shared.test.ts is the other
// half), so the same number reads the same in the app, the email and an alert.
type sharedFormat struct {
	Int []struct {
		In  int64
		Out string
	}
	Percent []struct {
		In  float64
		Out string
	}
	Move []struct {
		Cur, Prev float64
		Dir, Pct  string
	}
	Duration []struct {
		In  float64
		Out string
	}
	Times []struct {
		In  float64
		Out string
	}
	Money []struct {
		Minor    int64
		Currency string
		Exponent int
		Out      string
	}
	MoneyCents []struct {
		Minor    float64
		Currency string
		Exponent int
		Out      string
	}
}

func TestFiguresMatchTheDashboard(t *testing.T) {
	raw, err := os.ReadFile("testdata/format.json")
	if err != nil {
		t.Fatal(err)
	}
	var f sharedFormat
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	w := For("en")
	for _, c := range f.Int {
		if got := w.Number(c.In); got != c.Out {
			t.Errorf("int %d: %q, want %q", c.In, got, c.Out)
		}
	}
	for _, c := range f.Percent {
		if got := w.Percent(c.In); got != c.Out {
			t.Errorf("percent %v: %q, want %q", c.In, got, c.Out)
		}
	}
	for _, c := range f.Move {
		want := w.Same
		if c.Dir == "up" {
			want = w.Up + " " + c.Pct + "%"
		}
		if c.Dir == "down" {
			want = w.Down + " " + c.Pct + "%"
		}
		if got := w.Change(c.Cur, c.Prev); got != want {
			t.Errorf("change %v -> %v: %q, want %q", c.Prev, c.Cur, got, want)
		}
	}
	for _, c := range f.Duration {
		if got := Duration(c.In); got != c.Out {
			t.Errorf("duration %v: %q, want %q", c.In, got, c.Out)
		}
	}
	for _, c := range f.Times {
		if got := moments.Times(c.In); got != c.Out {
			t.Errorf("times %v: %q, want %q", c.In, got, c.Out)
		}
	}
	for _, c := range f.Money {
		if got := w.Money(c.Minor, c.Currency, c.Exponent); got != c.Out {
			t.Errorf("money %d %s: %q, want %q", c.Minor, c.Currency, got, c.Out)
		}
	}
	for _, c := range f.MoneyCents {
		if got := w.MoneyCents(c.Minor, c.Currency, c.Exponent); got != c.Out {
			t.Errorf("money with cents %v %s: %q, want %q", c.Minor, c.Currency, got, c.Out)
		}
	}
}

func TestDecimalsFollowTheLanguage(t *testing.T) {
	if got := For("de").Percent(0.045); got != "4,5%" {
		t.Errorf("de percent: %q", got)
	}
	if got := For("en").Percent(0.045); got != "4.5%" {
		t.Errorf("en percent: %q", got)
	}
}
