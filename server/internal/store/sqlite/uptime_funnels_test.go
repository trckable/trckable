package sqlite

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
)

func openWithSite(t *testing.T) (*Store, string) {
	t.Helper()
	ctx := context.Background()
	st, err := Open(ctx, filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	site, err := st.CreateSite(ctx, DefaultAccount, "a.com", "")
	if err != nil {
		t.Fatal(err)
	}
	return st, site
}

func TestCleanUptimePath(t *testing.T) {
	for in, want := range map[string]string{"/pricing": "/pricing", " /a/b?x=1 ": "/a/b?x=1", "/": "/"} {
		if got, err := CleanUptimePath(in); err != nil || got != want {
			t.Errorf("%q: %q %v", in, got, err)
		}
	}
	for _, bad := range []string{"", "pricing", "//evil.com", "https://evil.com/", "/a b", "/a#b", "/a\x00", `/\evil.com`, "/" + strings.Repeat("a", 200)} {
		if _, err := CleanUptimePath(bad); !errors.Is(err, ErrUptimePath) {
			t.Errorf("%q was kept: %v", bad, err)
		}
	}
}

func TestUptimePathsAreFiveAndGoWithTheSite(t *testing.T) {
	ctx := context.Background()
	st, site := openWithSite(t)
	for i := range MaxUptimePaths {
		if _, err := st.AddUptimePath(ctx, site, fmt.Sprintf("/p%d", i)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := st.AddUptimePath(ctx, site, "/p0"); err != nil {
		t.Fatalf("one already there: %v", err)
	}
	if _, err := st.AddUptimePath(ctx, site, "/extra"); !errors.Is(err, ErrUptimeFull) {
		t.Fatalf("a sixth: %v", err)
	}
	u, err := st.RemoveUptimePath(ctx, site, "/p0")
	if err != nil || len(u.Paths) != 4 {
		t.Fatalf("%v %v", u, err)
	}
	if _, err := st.DB.ExecContext(ctx, `PRAGMA foreign_keys = ON`); err != nil {
		t.Fatal(err)
	}
	if err := st.SetUptimePaused(ctx, site, true, 5); err != nil {
		t.Fatal(err)
	}
	if paused, _ := st.PausedUptime(ctx); !paused[site] {
		t.Fatal("not paused")
	}
}

func TestFunnelsAreNamedCheckedAndKeptPerSite(t *testing.T) {
	ctx := context.Background()
	st, site := openWithSite(t)
	steps := []FunnelStep{{"page", "/pricing"}, {"goal", "signup"}}
	f, err := st.CreateFunnel(ctx, site, "Signup", steps)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.CreateFunnel(ctx, site, "signup", steps); !errors.Is(err, ErrFunnelTaken) {
		t.Fatalf("same name: %v", err)
	}
	if _, err := st.CreateFunnel(ctx, site, "Other", steps[:1]); !errors.Is(err, ErrFunnelSteps) {
		t.Fatalf("one step: %v", err)
	}
	name := "Checkout"
	g, err := st.UpdateFunnel(ctx, site, f.ID, &name, nil)
	if err != nil || g.Name != "Checkout" || len(g.Steps) != 2 {
		t.Fatalf("%+v %v", g, err)
	}
	three := append([]FunnelStep{{"page", "/"}}, steps...)
	if g, err = st.UpdateFunnel(ctx, site, f.ID, nil, three); err != nil || len(g.Steps) != 3 || g.Name != "Checkout" {
		t.Fatalf("%+v %v", g, err)
	}
	if list, _ := st.Funnels(ctx, site); len(list) != 1 || len(list[0].Steps) != 3 {
		t.Fatalf("%+v", list)
	}
	for i := 1; i < MaxFunnels; i++ {
		if _, err := st.CreateFunnel(ctx, site, fmt.Sprintf("F%d", i), steps); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := st.CreateFunnel(ctx, site, "One too many", steps); !errors.Is(err, ErrFunnelFull) {
		t.Fatalf("21st: %v", err)
	}
	if err := st.DeleteFunnel(ctx, site, f.ID); err != nil {
		t.Fatal(err)
	}
	if err := st.DeleteFunnel(ctx, site, f.ID); err == nil {
		t.Fatal("deleted twice")
	}
}

// A paused stretch is counted as paused, clipped to the period asked about; one still going runs to the end of it.
func TestPausedSecondsAreClippedToThePeriod(t *testing.T) {
	ctx := context.Background()
	st, site := openWithSite(t)
	for _, step := range []struct {
		paused bool
		at     int64
	}{{true, 1000}, {true, 1100}, {false, 2000}, {true, 5000}} {
		if err := st.SetUptimePaused(ctx, site, step.paused, step.at); err != nil {
			t.Fatal(err)
		}
	}
	for _, c := range []struct{ from, to, want int64 }{
		{0, 10000, 1000 + 5000},
		{1500, 1800, 300},
		{1900, 6000, 100 + 1000},
		{2000, 5000, 0},
		{7000, 8000, 1000},
	} {
		if got, err := st.PausedSeconds(ctx, site, c.from, c.to); err != nil || got != c.want {
			t.Errorf("%d..%d: %d %v, want %d", c.from, c.to, got, err, c.want)
		}
	}
}
