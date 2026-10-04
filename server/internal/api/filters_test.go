package api

import (
	"context"
	"net/http"
	"net/url"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func TestParseFilters(t *testing.T) {
	got, err := parseFilters([]string{"country:DE", "country:AT", "device!:Mobile", "page:/a:b", "page!:/x"})
	if err != nil {
		t.Fatal(err)
	}
	want := []query.Filter{
		{Dim: "country", Op: "is", Value: "DE"}, {Dim: "country", Op: "is", Value: "AT"},
		{Dim: "device", Op: "not", Value: "Mobile"},
		{Dim: "page", Op: "is", Value: "/a:b"}, {Dim: "page", Op: "not", Value: "/x"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %+v\nwant %+v", got, want)
	}
	// Addresses from before "is not" mean what they always meant.
	old, err := parseFilters([]string{"channel:Search"})
	if err != nil || len(old) != 1 || old[0].Dim != "channel" || old[0].Op == "not" || old[0].Value != "Search" {
		t.Errorf("old form: %+v %v", old, err)
	}
	for _, bad := range []string{"country", "country:", ":DE", "!:DE", "bogus:x", "bogus!:x", "country!!:x", "country; DROP:x"} {
		if _, err := parseFilters([]string{bad}); err == nil {
			t.Errorf("%q was accepted", bad)
		}
	}
}

func TestReportTakesIsNotAnyOfAndSegments(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	at := g.now.Add(-time.Hour).UnixMilli()
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 1, Visitor: 1, Path: "/", TS: at, Country: "DE", Device: "Desktop"})
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 2, Visitor: 2, Path: "/", TS: at, Country: "US", Device: "Mobile"})
	g.event(t, event.Event{Kind: event.KindPageview, EventID: 3, Visitor: 3, Path: "/", TS: at, Country: "AT", Device: "Desktop"})
	g.waitApplied(t, 3)

	visitors := func(cl *http.Client, path, qs string) int {
		t.Helper()
		code, out := do(t, cl, "GET", path+"?from=2026-09-22&to=2026-09-22&"+qs, "")
		if code != 200 {
			t.Fatalf("%s: %d %v", qs, code, out)
		}
		return int(out["current"].(map[string]any)["kpis"].(map[string]any)["visitors"].(float64))
	}
	for _, tc := range []struct {
		qs   string
		want int
	}{
		{"f=country:DE", 1},
		{"f=country!:US", 2},
		{"f=country:DE&f=country:AT", 2},
		{"f=country:DE&f=country:AT&f=device!:Mobile", 2},
		{"f=country:DE&f=country:AT&f=country!:AT", 1},
		{"f=country!:DE&f=country!:AT", 1},
	} {
		if got := visitors(c, base+"/report", tc.qs); got != tc.want {
			t.Errorf("%s: %d visitors, want %d", tc.qs, got, tc.want)
		}
	}
	// 21 values is too many; the CSV and the other reports read the same words.
	var many []string
	for i := 0; i < 21; i++ {
		many = append(many, "f=country:X"+string(rune('A'+i)))
	}
	if code, _ := do(t, c, "GET", base+"/report?"+strings.Join(many, "&"), ""); code != http.StatusBadRequest {
		t.Errorf("21 values: %d", code)
	}
	if code, _ := do(t, c, "GET", base+"/report?f=country!:%27%20OR%201=1", ""); code != 200 {
		t.Errorf("an injection attempt is only a value that matches nothing: %d", code)
	}
	req, _ := http.NewRequest("GET", base+"/export.csv?from=2026-09-22&to=2026-09-22&f=country:DE&f=country:AT", nil)
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var buf strings.Builder
	b := make([]byte, 4096)
	for {
		n, err := resp.Body.Read(b)
		buf.Write(b[:n])
		if err != nil {
			break
		}
	}
	if !strings.Contains(buf.String(), "total,2026-09-22 to 2026-09-22,2,") {
		t.Errorf("the export did not take the same filters:\n%s", buf.String())
	}
	// And it says them the way the chips do, ahead of the numbers.
	if lines := strings.Split(buf.String(), "\n"); len(lines) < 3 || !strings.HasPrefix(lines[1], "filters,Country is Germany or Austria,") || !strings.HasPrefix(lines[2], "total,") {
		t.Errorf("the file does not state its filters first:\n%s", buf.String())
	}

	// A saved segment is a name for such a query, and the API takes it by id.
	q := url.Values{"f": {"country:DE", "country:AT", "device!:Mobile"}, "period": {"7d"}}.Encode()
	code, seg := do(t, c, "POST", base+"/segments", `{"name":"DACH desktop","query":"`+q+`"}`, csrf, "1")
	if code != http.StatusCreated {
		t.Fatalf("save segment: %d %v", code, seg)
	}
	id := seg["id"].(string)
	if got := visitors(c, base+"/report", "segment="+id); got != 2 {
		t.Errorf("segment: %d visitors", got)
	}
	if got := visitors(c, base+"/report", "segment="+id+"&f=country!:AT"); got != 1 {
		t.Errorf("segment plus a filter: %d visitors", got)
	}
	if code, _ := do(t, c, "GET", base+"/report?segment=seg_nothere", ""); code != http.StatusBadRequest {
		t.Errorf("an unknown segment: %d", code)
	}
	// A segment is its site's: another site's id names nothing here.
	other, err := g.ctl.CreateSite(context.Background(), sqlite.DefaultAccount, "other.com", "")
	if err != nil {
		t.Fatal(err)
	}
	o, err := g.ctl.SaveSegment(context.Background(), other, "theirs", "f=country:DE")
	if err != nil {
		t.Fatal(err)
	}
	if code, _ := do(t, c, "GET", base+"/report?segment="+o.ID, ""); code != http.StatusBadRequest {
		t.Errorf("another site's segment: %d", code)
	}
	// Nor can a link to this site be pointed at it.
	_, made := do(t, c, "POST", base+"/shares", `{"name":"x"}`, csrf, "1")
	link, _ := made["url"].(string)
	anon := client()
	if code, _ := do(t, anon, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+link[len(link)-26:]+`"}`); code != 200 {
		t.Fatalf("open: %d", code)
	}
	if got := visitors(anon, g.srv.URL+"/api/v1/share/report", "f=country!:US"); got != 2 {
		t.Errorf("share link filter: %d", got)
	}
	if code, _ := do(t, anon, "GET", g.srv.URL+"/api/v1/share/report?segment="+o.ID, ""); code != http.StatusBadRequest {
		t.Errorf("a share link read another site's segment: %d", code)
	}
	// Saving checks the filters too: a view that could never open is refused.
	if code, _ := do(t, c, "POST", base+"/segments", `{"name":"bad","query":"f=bogus%3Ax"}`, csrf, "1"); code != http.StatusBadRequest {
		t.Errorf("a bad segment was saved: %d", code)
	}
}

func TestFilterWordsAreTheChipsWords(t *testing.T) {
	got := filterWords([]query.Filter{
		{Dim: "country", Op: "is", Value: "US"}, {Dim: "country", Op: "is", Value: "DE"},
		{Dim: "device", Op: "not", Value: "Mobile"},
		{Dim: "channel", Value: "AI"}, {Dim: "entry_page", Op: "not", Value: "/pricing"}, {Dim: "region", Value: "Bavaria"},
	})
	want := "Country is United States or Germany; Device is not Mobile; Channel is AI assistants; Entry page is not /pricing; region is Bavaria"
	if got != want {
		t.Errorf("got  %q\nwant %q", got, want)
	}
	if filterWords(nil) != "" {
		t.Error("a file with no filters has no line about them")
	}
}
