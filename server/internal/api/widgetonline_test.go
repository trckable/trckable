package api

import (
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/query"
)

// The online design has three modes, each a set of parts: anything that does
// not belong to the design, or to its mode, is refused or dropped.
func TestOnlineWidgetKinds(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/widgets"

	if code, _ := do(t, owner, "POST", base, `{"kind":"online","shows":["bars"]}`, csrf, "1"); code != http.StatusBadRequest {
		t.Fatalf("a part the online design does not have must be refused: %d", code)
	}
	for _, tc := range []struct{ shows, want string }{
		{`[]`, `[]`},
		{`["spark"]`, `["spark"]`},
		{`["card","countries","pages"]`, `["card","pages","countries"]`},
		{`["card","spark"]`, `["card"]`},
		{`["pages"]`, `[]`}, // a list belongs to the card
	} {
		code, out := do(t, owner, "POST", base, `{"kind":"online","shows":`+tc.shows+`}`, csrf, "1")
		if code != http.StatusCreated {
			t.Fatalf("%s: %d %v", tc.shows, code, out)
		}
		if got := toJSON(out["shows"]); got != tc.want {
			t.Fatalf("%s kept %s, want %s", tc.shows, got, tc.want)
		}
		do(t, owner, "DELETE", base+"/"+out["id"].(string), "", csrf, "1")
	}
	// Left unsaid, it starts as the plain pill.
	_, out := do(t, owner, "POST", base, `{"kind":"online"}`, csrf, "1")
	if got := toJSON(out["shows"]); got != `[]` {
		t.Fatalf("default mode: %s", got)
	}
}

// A lone visitor must not be picked out: below three people the count reads
// "A few", there is no chart, and no page or country is named; and the page
// follows the numbers within fifteen seconds, not a minute.
func TestOnlineWidgetThresholdAndCache(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/widgets"
	made := func(body string) string {
		code, out := do(t, owner, "POST", base, body, csrf, "1")
		if code != http.StatusCreated {
			t.Fatalf("create: %d %v", code, out)
		}
		return out["id"].(string)
	}
	card := made(`{"kind":"online","shows":["card","pages","countries"]}`)
	pill := made(`{"kind":"online","shows":[]}`)
	spark := made(`{"kind":"online","shows":["spark"]}`)
	page := func(id string) string {
		res, err := http.Get(g.srv.URL + "/w/" + id)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("page: %d %s", res.StatusCode, b)
		}
		if res.Header.Get("Set-Cookie") != "" || strings.Contains(string(b), "<script") {
			t.Fatal("a widget sets no cookie and carries no script")
		}
		return string(b)
	}
	visit := func(n int, from uint64, path, country string) {
		for i := 0; i < n; i++ {
			g.event(t, event.Event{Kind: event.KindPageview, EventID: from*100 + uint64(i), TS: g.now.Add(-time.Minute).UnixMilli(), Visitor: from*100 + uint64(i), Path: path, Country: country})
		}
	}

	visit(2, 1, "/secret-offer", "AL")
	g.waitApplied(t, 2)
	for _, id := range []string{card, pill, spark} {
		body := page(id)
		if !strings.Contains(body, "A few online") && !strings.Contains(body, ">A few<") {
			t.Fatalf("two people read as a few: %s", body)
		}
		for _, leak := range []string{">2<", "secret-offer", "Albania", `class="bars"`, `class="spark"`} {
			if strings.Contains(body, leak) {
				t.Fatalf("two people leak %q: %s", leak, body)
			}
		}
	}

	// A third person arrives inside the fifteen seconds: the cached page stands.
	visit(1, 2, "/secret-offer", "AL")
	g.waitApplied(t, 3)
	if body := page(pill); !strings.Contains(body, "A few online") {
		t.Fatalf("the cached numbers were read again too soon: %s", body)
	}
	// Past them, three people are a number, and the card may name what they read.
	g.advance(16 * time.Second)
	if body := page(pill); !strings.Contains(body, "3 online") || strings.Contains(body, "secret-offer") {
		t.Fatalf("pill with three: %s", body)
	}
	body := page(spark)
	if !strings.Contains(body, `class="spark"`) || strings.Contains(body, "secret-offer") {
		t.Fatalf("a sparkline once there are three, and never a page: %s", body)
	}
	body = page(card)
	for _, want := range []string{">3<", `class="bars"`, "secret-offer", "Albania"} {
		if !strings.Contains(body, want) {
			t.Fatalf("card with three misses %q: %s", want, body)
		}
	}
	if !strings.Contains(body, `content="30"`) {
		t.Fatalf("an online page reads itself again within 30 seconds: %s", body)
	}
}

// The threshold is applied where the numbers are read: a page two people are
// on never leaves the query, whatever shows it.
func TestOnlineNumbersKeepTheirThreshold(t *testing.T) {
	g := newRig(t)
	for i := 0; i < 5; i++ {
		path := "/busy"
		if i >= 3 {
			path = "/quiet"
		}
		g.event(t, event.Event{Kind: event.KindPageview, EventID: uint64(i + 1), TS: g.now.Add(-time.Minute).UnixMilli(), Visitor: uint64(10 + i), Path: path, Country: "DE"})
	}
	g.waitApplied(t, 5)
	n, err := g.api.Query().Widget(t.Context(), g.site, g.now, query.WidgetAsk{Online: true, Pages: true})
	if err != nil {
		t.Fatal(err)
	}
	if n.Online != 5 || len(n.Pages) != 1 || n.Pages[0].Name != "/busy" || n.Pages[0].Visitors != 3 {
		t.Fatalf("online %d, pages %+v", n.Online, n.Pages)
	}
}

// A short-lived entry goes after its own time, not the minute of the others.
func TestWidgetCacheKeepsShortLivedEntriesShort(t *testing.T) {
	var c widgetCache
	t0 := time.Unix(1_700_000_000, 0)
	c.putFor("s|online|{}", widgetNumbers{}, t0, widgetFresh("online"))
	c.put("s|live|{}", widgetNumbers{}, t0)
	if _, ok := c.get("s|online|{}", t0.Add(14*time.Second)); !ok {
		t.Fatal("the online numbers went early")
	}
	if _, ok := c.get("s|online|{}", t0.Add(16*time.Second)); ok {
		t.Fatal("the online numbers outlived fifteen seconds")
	}
	if _, ok := c.get("s|live|{}", t0.Add(59*time.Second)); !ok {
		t.Fatal("the others keep their minute")
	}
}

// The corner script only ever frames a widget that exists, is on, and is an
// online one.
func TestOnlineLook(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/widgets"
	_, on := do(t, owner, "POST", base, `{"kind":"online","theme":"dark","shows":["card","pages"]}`, csrf, "1")
	_, live := do(t, owner, "POST", base, `{"kind":"live"}`, csrf, "1")
	id := on["id"].(string)

	look, ok := g.api.OnlineLook(t.Context(), id)
	if !ok || look.Theme != "dark" || look.W <= 0 || look.H <= 0 {
		t.Fatalf("an online widget that is on: %+v %v", look, ok)
	}
	if _, ok := g.api.OnlineLook(t.Context(), live["id"].(string)); ok {
		t.Fatal("another design has no corner script")
	}
	if _, ok := g.api.OnlineLook(t.Context(), "w_doesnotexist"); ok {
		t.Fatal("an unknown id has no corner script")
	}
	do(t, owner, "PUT", base+"/"+id, `{"kind":"online","theme":"dark","on":false}`, csrf, "1")
	if _, ok := g.api.OnlineLook(t.Context(), id); ok {
		t.Fatal("a widget that is off has no corner script")
	}
}

// Widgets are told apart by name: blank is the design's own name and follows
// the design; a name is kept as written, trimmed, up to forty characters. The
// same id is edited in place, so what is pasted on a page keeps working.
func TestWidgetNameAndEdit(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	base := g.srv.URL + "/api/v1/sites/" + g.site + "/widgets"

	code, made := do(t, owner, "POST", base, `{"kind":"online","shows":[]}`, csrf, "1")
	if code != http.StatusCreated || made["name"] != "Online pill" {
		t.Fatalf("unnamed: %d %v", code, made["name"])
	}
	id := made["id"].(string)
	if code, _ := do(t, owner, "POST", base, `{"kind":"online","name":"`+strings.Repeat("x", 41)+`"}`, csrf, "1"); code != http.StatusBadRequest {
		t.Fatalf("a name over forty characters must be refused: %d", code)
	}
	if code, out := do(t, owner, "POST", base, `{"kind":"online","name":"`+strings.Repeat("é", 40)+`"}`, csrf, "1"); code != http.StatusCreated {
		t.Fatalf("forty characters, not forty bytes: %d %v", code, out)
	}

	// An edit that leaves the name as the design's own lets it follow the design.
	code, out := do(t, owner, "PUT", base+"/"+id, `{"kind":"online","name":"Online pill","shows":["card","pages"],"theme":"light","accent":"#38bdf8","radius":4,"on":true}`, csrf, "1")
	if code != http.StatusOK || out["id"] != id || out["name"] != "Online card" || out["theme"] != "light" || out["accent"] != "#38bdf8" || out["radius"] != float64(4) || toJSON(out["shows"]) != `["card","pages"]` {
		t.Fatalf("edit: %d %v", code, out)
	}
	// A rename is kept, trimmed, and survives the next edit of the look.
	code, out = do(t, owner, "PUT", base+"/"+id, "{\"kind\":\"online\",\"name\":\"  Footer \\n pill \",\"shows\":[\"spark\"],\"on\":true}", csrf, "1")
	if code != http.StatusOK || out["name"] != "Footer  pill" {
		t.Fatalf("rename: %d %v", code, out["name"])
	}
	_, out = do(t, owner, "PUT", base+"/"+id, `{"kind":"online","name":"Footer  pill","shows":[],"on":true}`, csrf, "1")
	if out["name"] != "Footer  pill" {
		t.Fatalf("a kept name changed with the look: %v", out["name"])
	}
	// The list shows it, and a blank name goes back to the design's own.
	res, err := owner.Get(base)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if !strings.Contains(string(b), `"name":"Footer  pill"`) {
		t.Fatalf("the list: %s", b)
	}
	_, out = do(t, owner, "PUT", base+"/"+id, `{"kind":"online","name":"","shows":["spark"],"on":true}`, csrf, "1")
	if out["name"] != "Online pill + graph" {
		t.Fatalf("blank: %v", out["name"])
	}
	// Another site's widget is not ours to edit.
	if code, _ := do(t, owner, "PUT", g.srv.URL+"/api/v1/sites/tkb_other/widgets/"+id, `{"kind":"online","on":true}`, csrf, "1"); code == http.StatusOK {
		t.Fatalf("a widget edited through a site that does not own it: %d", code)
	}
}
