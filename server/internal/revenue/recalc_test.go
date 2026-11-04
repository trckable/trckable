package revenue

import (
	"context"
	"errors"
	"testing"
)

func metaRules(t *testing.T, g *rig) (string, bool) {
	t.Helper()
	v, ok, err := g.st.Meta(context.Background(), rulesKey)
	if err != nil {
		t.Fatal(err)
	}
	return v, ok
}

func TestRecalcRunsOncePerVersionAndTellsNobody(t *testing.T) {
	n := newNoticeRig(t)
	ctx := context.Background()
	n.send("payment_intent.succeeded", n.svc.Now(), `{"id":"pi_1","amount_received":4900,"currency":"usd"}`)
	told := len(n.told)
	var sites []string
	n.svc.reprocessFn = func(ctx context.Context, site string) (int, error) {
		sites = append(sites, site)
		return n.svc.Reprocess(ctx, site)
	}

	n.svc.recalcTo(ctx, 3)
	if len(sites) != 1 || sites[0] != n.site {
		t.Fatalf("reprocessed %v, want [%s]", sites, n.site)
	}
	if v, _ := metaRules(t, n.rig); v != "3" {
		t.Fatalf("saved version %q, want 3", v)
	}
	if len(n.told) != told {
		t.Fatalf("recalculation told %d notices", len(n.told)-told)
	}
	n.svc.recalcTo(ctx, 3) // equal: nothing
	n.svc.recalcTo(ctx, 2) // lower wanted: nothing
	if len(sites) != 1 {
		t.Fatalf("ran again with the version already applied: %v", sites)
	}
	n.svc.recalcTo(ctx, 4)
	if len(sites) != 2 {
		t.Fatalf("a higher version did not recalculate: %v", sites)
	}
}

func TestRecalcFailureKeepsOldVersionAndRetries(t *testing.T) {
	n := newNoticeRig(t)
	ctx := context.Background()
	calls := 0
	n.svc.reprocessFn = func(context.Context, string) (int, error) {
		calls++
		return 0, errors.New("interrupted")
	}
	n.svc.recalcTo(ctx, 3)
	if _, ok := metaRules(t, n.rig); ok {
		t.Fatal("version saved although the site failed")
	}
	n.svc.reprocessFn = nil // the next start
	n.svc.recalcTo(ctx, 3)
	if v, _ := metaRules(t, n.rig); v != "3" || calls != 1 {
		t.Fatalf("after retry: version %q, failing calls %d", v, calls)
	}
}

func TestRecalcWithoutConnectionsOnlySavesVersion(t *testing.T) {
	g := newRig(t, t.TempDir(), "instance key for tests")
	g.svc.reprocessFn = func(context.Context, string) (int, error) { t.Fatal("no site to read"); return 0, nil }
	g.svc.recalcTo(context.Background(), 3)
	if v, _ := metaRules(t, g); v != "3" {
		t.Fatalf("saved version %q, want 3", v)
	}
}
