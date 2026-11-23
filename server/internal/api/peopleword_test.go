package api

import (
	"reflect"
	"strings"
	"testing"
)

// sayVisitor finds the word "visitor" in every string of a value: a person who
// arrived on the site is "people" in every English word the product shows.
func sayVisitor(v reflect.Value, path string, found *[]string) {
	switch v.Kind() {
	case reflect.String:
		if strings.Contains(strings.ToLower(v.String()), "visitor") {
			*found = append(*found, path+": "+v.String())
		}
	case reflect.Ptr, reflect.Interface:
		if !v.IsNil() {
			sayVisitor(v.Elem(), path, found)
		}
	case reflect.Struct:
		for i := 0; i < v.NumField(); i++ {
			{
				sayVisitor(v.Field(i), path+"."+v.Type().Field(i).Name, found)
			}
		}
	case reflect.Map:
		for _, k := range v.MapKeys() {
			sayVisitor(v.MapIndex(k), path+"."+k.String(), found)
		}
	case reflect.Slice, reflect.Array:
		for i := 0; i < v.Len(); i++ {
			sayVisitor(v.Index(i), path, found)
		}
	}
}

func TestEnglishCardWordsSayPeople(t *testing.T) {
	var found []string
	sayVisitor(reflect.ValueOf(cardEN), "cardEN", &found)
	if len(found) > 0 {
		t.Fatalf("English share-picture words say visitor: %v", found)
	}
}

func TestEnglishWidgetWordsSayPeople(t *testing.T) {
	loadLangs()
	var found []string
	for k, v := range langs["en"] {
		if strings.Contains(strings.ToLower(v), "visitor") {
			found = append(found, k+": "+v)
		}
	}
	if len(found) > 0 {
		t.Fatalf("English widget words say visitor: %v", found)
	}
}
