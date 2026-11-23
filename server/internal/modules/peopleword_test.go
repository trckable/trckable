package modules

import (
	"fmt"
	"strings"
	"testing"
)

// What a module says about itself uses "people", never "visitors". The
// `visitor` field of the payments API is a name in code, not a word to read,
// and is not part of these texts.
func TestModuleWordsSayPeople(t *testing.T) {
	for _, m := range All {
		if s := strings.ToLower(fmt.Sprintf("%+v", m)); strings.Contains(s, "visitor") {
			t.Errorf("module %s says visitor: %+v", m.ID, m)
		}
	}
}
