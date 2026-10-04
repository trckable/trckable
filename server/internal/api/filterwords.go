package api

import (
	"strings"

	"github.com/trckable/trckable/server/internal/importer"
	"github.com/trckable/trckable/server/internal/query"
)

// filterDimLabel is the word the dashboard's chips use for a dimension
// (dashboard/src/features/overview/dimLabels.ts); one it has none for is
// written as it is, as the chips do.
var filterDimLabel = map[string]string{
	"channel": "Channel", "referrer": "Referrer", "campaign": "Campaign",
	"entry_page": "Entry page", "exit_page": "Exit page", "page": "Page", "group": "Section",
	"country": "Country", "device": "Device", "browser": "Browser", "browser_version": "Browser version",
	"screen": "Screen", "os": "OS", "goal": "Goal", "utm_source": "utm_source", "utm_medium": "utm_medium",
}

// filterValue is a value as a chip reads it: a channel's or a country's name.
func filterValue(dim, v string) string {
	switch dim {
	case "channel":
		if v == "AI" {
			return "AI assistants"
		}
		if v == "" {
			return "Direct"
		}
	case "country":
		return importer.CountryName(v)
	}
	return v
}

// filterWords says the filters the way the chips do, so a file and the page
// it was taken from state the same thing: "Country is Germany or Austria;
// Device is not Mobile". Empty when nothing is filtered.
func filterWords(fs []query.Filter) string {
	type set struct {
		dim    string
		not    bool
		values []string
	}
	var sets []*set
	for _, f := range fs {
		not := f.Op == query.OpNot
		var s *set
		for _, x := range sets {
			if x.dim == f.Dim && x.not == not {
				s = x
				break
			}
		}
		if s == nil {
			s = &set{dim: f.Dim, not: not}
			sets = append(sets, s)
		}
		v := filterValue(f.Dim, f.Value)
		dup := false
		for _, x := range s.values {
			dup = dup || x == v
		}
		if !dup {
			s.values = append(s.values, v)
		}
	}
	parts := make([]string, 0, len(sets))
	for _, s := range sets {
		label, ok := filterDimLabel[s.dim]
		if !ok {
			label = s.dim
		}
		op := "is"
		if s.not {
			op = "is not"
		}
		parts = append(parts, label+" "+op+" "+strings.Join(s.values, " or "))
	}
	return strings.Join(parts, "; ")
}
