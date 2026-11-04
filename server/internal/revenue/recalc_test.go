package revenue

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func metaRules(t *testing.T, g *rig) (string, bool) {
	t.Helper()
	v, ok, err := g.st.Meta(context.Background(), rulesKey+g.site)
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

func TestRecalcRetriesOnlyTheFailedSite(t *testing.T) {
	n := newNoticeRig(t)
	ctx := context.Background()
	other, _, _ := n.st.EnsureSite(ctx, sqlite.DefaultAccount, "two.example")
	if _, err := n.svc.Connect(ctx, ConnectRequest{Site: other, Provider: "stripe", Secret: "whsec_two", PublicBase: "http://localhost:8080"}); err != nil {
		t.Fatal(err)
	}
	var seen []string
	n.svc.reprocessFn = func(_ context.Context, site string) (int, error) {
		seen = append(seen, site)
		if site == other {
			return 0, errors.New("broken")
		}
		return 0, nil
	}
	n.svc.recalcTo(ctx, 3)
	seen = nil
	n.svc.recalcTo(ctx, 3)
	if len(seen) != 1 || seen[0] != other {
		t.Fatalf("second start re-read %v, want only the failed site", seen)
	}
}

func TestRecalcKeepsALiveWebhooksNotice(t *testing.T) {
	n := newNoticeRig(t)
	ctx := context.Background()
	body := []byte(fmt.Sprintf(`{"id":"evt_live","type":"payment_intent.succeeded","created":%d,"livemode":true,"data":{"object":{"id":"pi_live","amount_received":4900,"currency":"usd"}}}`, time.Now().Unix()))
	if code := n.post(t, n.path, stripeSigned("whsec_test", body, time.Now()), body); code != 200 {
		t.Fatalf("webhook: %d", code)
	}
	n.svc.recalcTo(ctx, 3) // arrives before the processor has applied it
	if _, err := n.svc.Process(ctx); err != nil {
		t.Fatal(err)
	}
	n.wait()
	if len(n.told) != 1 {
		t.Fatalf("notices told: %d, want 1", len(n.told))
	}
}
