package ingest

import (
	"net/http"
	"testing"
	"time"
)

// A site that moved keeps counting visits from its old address until the
// grace ends, as the same visitors: nothing is lost and nothing counted twice.
// After it, the old address is refused like any foreign one.
func TestFormerHostIsAcceptedUntilItEnds(t *testing.T) {
	h, l := newHandler(t)
	now := h.Now()
	h.Sites = fakeSites{"tkb_test": {
		ID: "tkb_test", Domain: "new.com", ProxyKey: "tkb_px_secret",
		Former: []FormerHost{{Host: "site.com", Until: now.Add(48 * time.Hour)}},
	}}
	onNew := `{"s":"tkb_test","k":"pv","u":"https://new.com/"}`
	onOld := `{"s":"tkb_test","k":"pv","u":"https://www.site.com/"}`
	if w := post(h, onNew, chromeUA); w.Code != http.StatusAccepted {
		t.Fatalf("new address: %d", w.Code)
	}
	a, _ := lastEvent(t, l)
	if w := post(h, onOld, chromeUA); w.Code != http.StatusAccepted {
		t.Fatalf("old address inside the grace: %d %s", w.Code, w.Body)
	}
	b, _ := lastEvent(t, l)
	if a.Site != b.Site || a.Visitor != b.Visitor {
		t.Fatalf("same visitor must stay one: %+v %+v", a, b)
	}
	h.Now = func() time.Time { return now.Add(48*time.Hour + time.Second) }
	if w := post(h, onOld, chromeUA); w.Code == http.StatusAccepted {
		t.Fatal("old address after the grace must be refused")
	}
	if w := post(h, onNew, chromeUA); w.Code != http.StatusAccepted {
		t.Fatalf("new address after the grace: %d", w.Code)
	}
}
