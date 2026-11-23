package reports

import (
	"reflect"
	"strings"
	"testing"
)

// The English words of a report say "people", never "visitors".
func TestEnglishReportWordsSayPeople(t *testing.T) {
	w := reflect.ValueOf(words["en"])
	for i := 0; i < w.NumField(); i++ {
		if w.Field(i).Kind() == reflect.String && strings.Contains(strings.ToLower(w.Field(i).String()), "visitor") {
			t.Errorf("%s says visitor: %q", w.Type().Field(i).Name, w.Field(i).String())
		}
	}
}
