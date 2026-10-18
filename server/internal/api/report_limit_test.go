package api

import "testing"

// ?limit= is how many rows each breakdown lists: 1 to 100, and anything else is the engine's own ten.
func TestRowsAsked(t *testing.T) {
	for in, want := range map[string]int{"": 0, "1": 1, "10": 10, "100": 100, "101": 0, "0": 0, "-3": 0, "many": 0, "5.5": 0} {
		if got := rowsAsked(in); got != want {
			t.Errorf("rowsAsked(%q) = %d, want %d", in, got, want)
		}
	}
}
