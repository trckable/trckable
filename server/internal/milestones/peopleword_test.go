package milestones

import (
	"reflect"
	"strings"
	"testing"
)

// The English words of a milestone say "people", never "visitors".
func TestEnglishMilestoneWordsSayPeople(t *testing.T) {
	w := reflect.ValueOf(*English)
	for i := 0; i < w.NumField(); i++ {
		if w.Field(i).Kind() == reflect.String && strings.Contains(strings.ToLower(w.Field(i).String()), "visitor") {
			t.Errorf("%s says visitor: %q", w.Type().Field(i).Name, w.Field(i).String())
		}
	}
}
