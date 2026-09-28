package api

import (
	"os"
	"regexp"
	"testing"
)

// The widget's ghost is the brand's ghost: one logo, never a drifting copy.
func TestWidgetLogoMatchesTheBrand(t *testing.T) {
	src, err := os.ReadFile("../../../dashboard/src/brand/logo.ts")
	if err != nil {
		t.Skip("the dashboard source is not next to the server here")
	}
	for name, want := range map[string]string{"GHOST": logoGhost, "LINE": logoLine} {
		m := regexp.MustCompile(`const ` + name + ` = '([^']+)'`).FindSubmatch(src)
		if m == nil || string(m[1]) != want {
			t.Fatalf("%s in brand/logo.ts is %q; the widget draws %q", name, m, want)
		}
	}
}
