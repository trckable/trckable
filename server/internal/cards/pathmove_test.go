package cards

import "testing"

func TestMovePath(t *testing.T) {
	for _, c := range []struct{ name, in, want string }{
		{"absolute points move and scale", "M1 2L3 4Z", "M12.000 24.000L16.000 28.000Z"},
		{"relative ones only scale", "M1 1c-1 2 3 4 5 6h.5V3v-.25z", "M12.000 22.000c-2.000 4.000 6.000 8.000 10.000 12.000h1.000V26.000v-0.500z"},
		{"an arc keeps its angle and flags, its flags may run into the number", "M0 0A3 3 0 011.5-.5a1 2 30 1 0 .5.5", "M10.000 20.000A6.000 6.000 0.000 0.000 1.000 13.000 19.000a2.000 4.000 30.000 1.000 0.000 1.000 1.000"},
		{"numbers run together at a sign or a second point", "m.5.25-1.5-.5", "m11.000 20.500 -3.000 -1.000"},
		{"a path's first lowercase move is absolute, a later one relative", "m1 1l1 1zm1 1", "m12.000 22.000l2.000 2.000zm2.000 2.000"},
	} {
		if got := movePath(c.in, 10, 20, 2); got != c.want {
			t.Errorf("%s: %q, want %q", c.name, got, c.want)
		}
	}
}

// Every mark in the file is complete and moves into the card.
func TestMarksDraw(t *testing.T) {
	for id, m := range sourceMarks() {
		if m.D == "" || m.Name == "" || m.Color == "" || movePath(m.D, 0, 0, 1) == "" {
			t.Errorf("%s: incomplete", id)
		}
	}
}
