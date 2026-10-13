package server

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

// A site that fails to prune does not stop the others, and the error names it.
func TestPruneEachGoesPastAFailingSite(t *testing.T) {
	plan := map[string]int{"a": 30, "b": 30, "c": 30}
	var pruned, told []string
	prune := func(_ context.Context, site string, _ int64) (int64, error) {
		pruned = append(pruned, site)
		if site == "a" || site == "b" {
			return 0, errors.New("disk")
		}
		return 5, nil
	}
	err := pruneEach(context.Background(), plan, time.Now(), prune, func(site string, _ int, _ int64) { told = append(told, site) })
	if len(pruned) != 3 {
		t.Fatalf("pruned %v, want all three sites tried", pruned)
	}
	if len(told) != 1 || told[0] != "c" {
		t.Fatalf("reported %v, want only c", told)
	}
	if err == nil || !strings.Contains(err.Error(), "site a") || !strings.Contains(err.Error(), "site b") {
		t.Fatalf("error %v should name both failed sites", err)
	}
}
