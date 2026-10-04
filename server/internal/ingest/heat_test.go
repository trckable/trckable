package ingest

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
)

func heatPost(h *Handler, body string, edit ...func(*http.Request)) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/h", strings.NewReader(body))
	req.Header.Set("User-Agent", chromeUA)
	req.RemoteAddr = "203.0.113.77:5555"
	for _, e := range edit {
		e(req)
	}
	w := httptest.NewRecorder()
	h.Heat(w, req)
	return w
}

const heatBatch = `{"s":"tkb_test","u":"https://site.com/pricing?utm=x","w":1440,"h":5200,"i":[
	["v"],
	["c","main#page>button.buy",2,5,69,50,69,40],
	["c","main#page>button.buy",2,5,70,52,69,40],
	["d","main#page>div.card",0,0,100,300,200,80],
	["r","main#page>button.buy",2,5,69,50,69,40],
	["fr","signup>email"],["fr","signup>plan"],["fd","signup>plan"]]}`

func find(rows []HeatRow, kind, el string) (HeatRow, bool) {
	for _, r := range rows {
		if r.Kind == kind && r.El == el {
			return r, true
		}
	}
	return HeatRow{}, false
}

func TestHeatCountsPerElementAndNothingElse(t *testing.T) {
	h, _ := newHandler(t)
	if w := heatPost(h, heatBatch); w.Code != http.StatusAccepted {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	if w := heatPost(h, heatBatch); w.Code != http.StatusAccepted {
		t.Fatalf("second batch: status %d", w.Code)
	}
	rows := h.Heats.Drain()
	for _, r := range rows {
		if r.Site != "tkb_test" || r.Day != "2026-09-22" || r.Path != "/pricing" || r.Width != HeatDesktop {
			t.Fatalf("a row is filed under %+v", r)
		}
	}
	v, ok := find(rows, "v", "")
	if !ok || v.N != 2 || v.W != 2*1440 || v.H != 2*5200 {
		t.Errorf("page views = %+v, want 2 with their widths and heights summed", v)
	}
	// The two clicks landed in the same tenth of the button: one counter.
	c, ok := find(rows, "c", "main#page>button.buy")
	if !ok || c.N != 4 || c.CX != 2 || c.CY != 5 {
		t.Errorf("clicks = %+v", c)
	}
	if c.X != 278 || c.Y != 204 || c.W != 276 || c.H != 160 {
		t.Errorf("click sums = %+v, want x 278, y 204, w 276, h 160 over four clicks", c)
	}
	for _, kind := range []string{"d", "r"} {
		if r, ok := find(rows, kind, map[string]string{"d": "main#page>div.card", "r": "main#page>button.buy"}[kind]); !ok || r.N != 2 {
			t.Errorf("%s = %+v, want 2", kind, r)
		}
	}
	if r, ok := find(rows, "fd", "signup>plan"); !ok || r.N != 2 {
		t.Errorf("form left at plan = %+v", r)
	}
	if rows2 := h.Heats.Drain(); len(rows2) != 0 {
		t.Errorf("a drained counter was handed over twice: %d rows", len(rows2))
	}
}

func TestHeatWidthBuckets(t *testing.T) {
	for w, want := range map[int]uint16{320: HeatPhone, 639: HeatPhone, 640: HeatTablet, 1023: HeatTablet, 1024: HeatDesktop, 3840: HeatDesktop} {
		if got := heatBucket(w); got != want {
			t.Errorf("width %d is in bucket %d, want %d", w, got, want)
		}
	}
}

func TestHeatRefusesWhatOurScriptNeverSends(t *testing.T) {
	good := `["c","main>button.buy",2,5,69,50,69,40]`
	for name, item := range map[string]string{
		"a sentence for an element":  `["c","I clicked on Buy now",2,5,69,50,69,40]`,
		"markup for an element":      `["c","<script>",2,5,69,50,69,40]`,
		"an empty element":           `["c","",2,5,69,50,69,40]`,
		"a long element":             `["c","` + strings.Repeat("a", 121) + `",2,5,69,50,69,40]`,
		"a cell past the tenth":      `["c","main>a",10,5,69,50,69,40]`,
		"a negative place":           `["c","main>a",2,5,-1,50,69,40]`,
		"a fraction":                 `["c","main>a",2,5,6.9,50,69,40]`,
		"a place far off the page":   `["c","main>a",2,5,69,5000000,69,40]`,
		"a click with a missing end": `["c","main>a",2,5,69,50,69]`,
		"an unknown kind":            `["x","main>a"]`,
		"a view that carries a text": `["v","main>a"]`,
		"a field with no form":       `["fr","email"]`,
		"a field with a space":       `["fr","signup>first name"]`,
		"two forms in a field":       `["fr","a>b>c"]`,
		"a kind that is a number":    `[7,"main>a"]`,
		"nothing":                    `[]`,
	} {
		h, _ := newHandler(t)
		body := `{"s":"tkb_test","u":"https://site.com/","w":1440,"h":900,"i":[["v"],` + good + `,` + item + `]}`
		if name == "nothing" {
			body = `{"s":"tkb_test","u":"https://site.com/","w":1440,"h":900,"i":[["v"],` + good + `,[]]}`
		}
		if w := heatPost(h, body); w.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d, want 400", name, w.Code)
		}
		// All or nothing: the good items beside the bad one are not counted either.
		if n := len(h.Heats.Drain()); n != 0 {
			t.Errorf("%s: %d counters were kept from a refused batch", name, n)
		}
	}
}

func TestHeatRefusesBadBatches(t *testing.T) {
	h, _ := newHandler(t)
	many := make([]string, heatMaxItems+1)
	for i := range many {
		many[i] = `["v"]`
	}
	for name, body := range map[string]string{
		"not json":               `nope`,
		"no items":               `{"s":"tkb_test","u":"https://site.com/","w":1440,"i":[]}`,
		"too many items":         `{"s":"tkb_test","u":"https://site.com/","w":1440,"i":[` + strings.Join(many, ",") + `]}`,
		"no window":              `{"s":"tkb_test","u":"https://site.com/","i":[["v"]]}`,
		"a huge window":          `{"s":"tkb_test","u":"https://site.com/","w":99999,"i":[["v"]]}`,
		"a page of someone else": `{"s":"tkb_test","u":"https://other.example/","w":1440,"i":[["v"]]}`,
		"a bad address":          `{"s":"tkb_test","u":"::","w":1440,"i":[["v"]]}`,
	} {
		if w := heatPost(h, body); w.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d, want 400", name, w.Code)
		}
	}
	if w := heatPost(h, `{"s":"tkb_nope","u":"https://site.com/","w":1440,"i":[["v"]]}`); w.Code != http.StatusNotFound {
		t.Errorf("unknown site: status %d, want 404", w.Code)
	}
	if w := heatPost(h, strings.Repeat("x", heatMaxBody+1)); w.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("a huge body: status %d, want 413", w.Code)
	}
	w := httptest.NewRecorder()
	h.Heat(w, httptest.NewRequest(http.MethodGet, "/api/h", nil))
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET: status %d, want 405", w.Code)
	}
	w = httptest.NewRecorder()
	h.Heat(w, httptest.NewRequest(http.MethodOptions, "/api/h", nil))
	if w.Code != http.StatusNoContent || w.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Errorf("OPTIONS: status %d, origin %q", w.Code, w.Header().Get("Access-Control-Allow-Origin"))
	}
	if n := len(h.Heats.Drain()); n != 0 {
		t.Errorf("%d counters were kept from refused batches", n)
	}
}

func TestHeatOneSiteCannotReportAsAnother(t *testing.T) {
	h, _ := newHandler(t)
	forged := func(r *http.Request) { r.Header.Set("Origin", "https://evil.example") }
	if w := heatPost(h, heatBatch, forged); w.Code != http.StatusBadRequest {
		t.Errorf("a page of another site: status %d, want 400", w.Code)
	}
	own := func(r *http.Request) { r.Header.Set("Origin", "https://www.site.com") }
	if w := heatPost(h, heatBatch, own); w.Code != http.StatusAccepted {
		t.Errorf("its own page: status %d, want 202", w.Code)
	}
}

func TestHeatModuleOffRecordsNothingAndSaysNothing(t *testing.T) {
	h, _ := newHandler(t)
	h.Module = func(site, id string) bool { return id != "heatmaps" }
	if w := heatPost(h, heatBatch); w.Code != http.StatusAccepted {
		t.Errorf("status %d, want 202", w.Code)
	}
	if n := len(h.Heats.Drain()); n != 0 {
		t.Errorf("%d counters were kept with the module off", n)
	}
}

func TestHeatLeavesOutWhatTheOwnerLeftOut(t *testing.T) {
	h, _ := newHandler(t)
	h.Sites = fakeSites{"tkb_test": {ID: "tkb_test", Domain: "site.com", HonorDNT: true, ExcludePaths: []string{"/admin/*", "/pricing"},
		ExcludeIPs: []netip.Prefix{netip.MustParsePrefix("198.51.100.0/24")}}}
	body := func(path string) string {
		return strings.Replace(heatBatch, "/pricing?utm=x", path, 1)
	}
	for name, c := range map[string]struct {
		body string
		edit func(*http.Request)
	}{
		"an excluded page":          {heatBatch, nil},
		"a prefix that is left out": {body("/admin/users"), nil},
		"do not track":              {body("/blog"), func(r *http.Request) { r.Header.Set("DNT", "1") }},
		"global privacy control":    {body("/blog"), func(r *http.Request) { r.Header.Set("Sec-GPC", "1") }},
		"the owner's own address":   {body("/blog"), func(r *http.Request) { r.RemoteAddr = "198.51.100.9:1" }},
		"a robot":                   {body("/blog"), func(r *http.Request) { r.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Googlebot/2.1)") }},
		"a headless browser":        {body("/blog"), func(r *http.Request) { r.Header.Set("User-Agent", "Mozilla/5.0 HeadlessChrome/140.0") }},
	} {
		var edit []func(*http.Request)
		if c.edit != nil {
			edit = append(edit, c.edit)
		}
		if w := heatPost(h, c.body, edit...); w.Code != http.StatusAccepted {
			t.Errorf("%s: status %d, want 202", name, w.Code)
		}
		if n := len(h.Heats.Drain()); n != 0 {
			t.Errorf("%s: %d counters were kept", name, n)
		}
	}
	// And a page nobody excluded, from a browser that said nothing, is counted.
	if heatPost(h, body("/blog")).Code != http.StatusAccepted || len(h.Heats.Drain()) == 0 {
		t.Error("an ordinary visit was not counted")
	}
}

func TestHeatIsRateLimited(t *testing.T) {
	h, _ := newHandler(t)
	var limited int
	for i := 0; i < heatPerIPBurst+20; i++ {
		if w := heatPost(h, heatBatch); w.Code == http.StatusTooManyRequests {
			limited++
			if w.Header().Get("Retry-After") == "" {
				t.Fatal("429 without Retry-After")
			}
		}
	}
	if limited < 15 {
		t.Errorf("one address sent %d batches and %d were refused: no limit", heatPerIPBurst+20, limited)
	}
	// Someone else is not held back by it.
	other := func(r *http.Request) { r.RemoteAddr = "203.0.113.200:1" }
	if w := heatPost(h, heatBatch, other); w.Code != http.StatusAccepted {
		t.Errorf("another address: status %d, want 202", w.Code)
	}
}

func TestHeatSiteWideLimit(t *testing.T) {
	h, _ := newHandler(t)
	var limited int
	for i := 0; i < heatPerSiteBurst+50; i++ {
		ip := func(r *http.Request) { r.RemoteAddr = fmt.Sprintf("10.%d.%d.1:1", i/250, i%250) }
		if heatPost(h, `{"s":"tkb_test","u":"https://site.com/","w":1440,"h":1,"i":[["v"]]}`, ip).Code == http.StatusTooManyRequests {
			limited++
		}
	}
	if limited == 0 {
		t.Error("many addresses together were never limited")
	}
}

func TestHeatMemoryIsBounded(t *testing.T) {
	var c HeatCounts
	for i := 0; i < heatMaxKeys+500; i++ {
		c.add(heatKey{Site: "s", Day: "d", Path: fmt.Sprintf("/p/%d", i), Kind: "v"}, heatSum{N: 1})
	}
	if n := len(c.Drain()); n != heatMaxKeys {
		t.Errorf("%d counters held, want at most %d", n, heatMaxKeys)
	}
	// A counter that exists keeps counting when the map is full.
	for i := 0; i < heatMaxKeys; i++ {
		c.add(heatKey{Site: "s", Day: "d", Path: fmt.Sprintf("/p/%d", i), Kind: "v"}, heatSum{N: 1})
	}
	c.add(heatKey{Site: "s", Day: "d", Path: "/p/0", Kind: "v"}, heatSum{N: 4})
	rows := c.Drain()
	for _, r := range rows {
		if r.Path == "/p/0" && r.N != 5 {
			t.Errorf("a counter that was already there stopped counting: %d", r.N)
		}
	}
}

func TestHeatDrainAndRestore(t *testing.T) {
	var c HeatCounts
	k := heatKey{Site: "s", Day: "2026-09-22", Path: "/", Width: HeatPhone, Kind: "c", El: "a", CX: 1, CY: 2}
	c.add(k, heatSum{N: 2, X: 10, Y: 20, W: 30, H: 40})
	rows := c.Drain()
	c.add(k, heatSum{N: 1, X: 1, Y: 1, W: 1, H: 1}) // arrives while the write fails
	c.Restore(rows)
	got := c.Drain()
	if len(got) != 1 || got[0].N != 3 || got[0].X != 11 || got[0].H != 41 {
		t.Fatalf("after a failed write the counts are %+v, want everything once", got)
	}
}

// What leaves the handler is counters, and a counter has no person in it: the
// row type has no field a visitor, a session or a time of day could go in.
func TestHeatRowsCarryNoPerson(t *testing.T) {
	b, _ := json.Marshal(HeatRow{})
	for _, bad := range []string{"visitor", "session", "ip", "agent", "ts", "time", "value", "text"} {
		if strings.Contains(strings.ToLower(string(b)), `"`+bad) {
			t.Errorf("a heat row has a %q field", bad)
		}
	}
}
