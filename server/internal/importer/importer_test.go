package importer

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

type fakeLog struct{ events []event.Event }

func (f *fakeLog) Append(_ context.Context, b []byte) (uint64, error) {
	var e event.Event
	if err := json.Unmarshal(b, &e); err != nil {
		return 0, err
	}
	f.events = append(f.events, e)
	return uint64(len(f.events)), nil
}

func TestImportNDJSON(t *testing.T) {
	in := strings.NewReader(`{"ts":"2026-09-10T10:00:00Z","path":"/","visitor":"a","referrer":"https://www.google.com/search?q=x","country":"de","device":"Desktop"}
{"ts":"2026-09-10T10:02:00Z","path":"https://example.com/pricing","visitor":"a","country":"DE"}
{"ts":"2026-09-10T10:03:00Z","goal":"signup","visitor":"a"}
{"ts":"not a time","path":"/skipped"}
`)
	log := &fakeLog{}
	res, err := Run(context.Background(), log, "s1", in, "")
	if err != nil {
		t.Fatal(err)
	}
	if res.Rows != 3 || res.Skipped != 1 {
		t.Fatalf("rows %d skipped %d", res.Rows, res.Skipped)
	}
	if log.events[0].RefHost != "google.com" {
		t.Fatalf("referrer host: %q", log.events[0].RefHost)
	}
	if log.events[0].Channel != "Search" {
		t.Fatalf("channel: %q", log.events[0].Channel)
	}
	if log.events[1].Path != "/pricing" {
		t.Fatalf("a full URL should keep its path, got %q", log.events[1].Path)
	}
	if log.events[2].Kind != event.KindGoal || log.events[2].Goal != "signup" {
		t.Fatalf("goal row: %+v", log.events[2])
	}
	// The same person in three rows is one visitor.
	if log.events[0].Visitor != log.events[1].Visitor || log.events[1].Visitor != log.events[2].Visitor {
		t.Fatal("the same source id should map to one visitor")
	}
	// And the raw id never lands in an event.
	if strings.Contains(string(rune(log.events[0].Visitor)), "a") {
		t.Fatal("the source id should be hashed")
	}
}

func TestImportCSV(t *testing.T) {
	in := strings.NewReader("ts,path,visitor,referrer,country\n" +
		"1789000000,/,bob,,US\n" +
		"2026-09-11,/docs,bob,https://chatgpt.com/,US\n")
	log := &fakeLog{}
	res, err := Run(context.Background(), log, "s1", in, "")
	if err != nil {
		t.Fatal(err)
	}
	if res.Rows != 2 {
		t.Fatalf("rows: %d", res.Rows)
	}
	if log.events[0].Channel != "Direct" {
		t.Fatalf("no referrer means Direct, got %q", log.events[0].Channel)
	}
	if log.events[1].Channel != "AI" {
		t.Fatalf("chatgpt.com should be AI, got %q", log.events[1].Channel)
	}
	if res.First.After(res.Last) {
		t.Fatal("first and last are the wrong way round")
	}
}

// Importing the same file twice must not double the numbers.
func TestImportIsIdempotent(t *testing.T) {
	line := `{"ts":"2026-09-10T10:00:00Z","path":"/","visitor":"a"}` + "\n"
	first, second := &fakeLog{}, &fakeLog{}
	Run(context.Background(), first, "s1", strings.NewReader(line), "")
	Run(context.Background(), second, "s1", strings.NewReader(line), "")
	if first.events[0].EventID != second.events[0].EventID {
		t.Fatal("the same row should get the same event id, so a second import is deduped")
	}
}

// An export arrives with whatever names the tool that made it uses. Renaming
// columns by hand before an import is exactly the kind of afternoon trckable
// should not cost anyone.
func TestOtherToolsColumnNames(t *testing.T) {
	// Umami-shaped NDJSON: numbers for the time, its own column names, and
	// "pageview" as the event name on every row.
	nd := `{"created_at":1758542340000,"url_path":"/pricing","session_id":9001,"referrer_domain":"google.com","event_name":"pageview","country_code":"de","device_type":"Mobile","browser_name":"Safari"}
{"created_at":1758542400000,"url_path":"/signup","session_id":9001,"event_name":"signup"}`
	rows, err := read(strings.NewReader(nd), "")
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("rows: %d", len(rows))
	}
	if rows[0].TS != "1758542340000" || rows[0].Path != "/pricing" || rows[0].Visitor != "9001" {
		t.Fatalf("first row: %+v", rows[0])
	}
	if rows[0].Referrer != "google.com" || rows[0].Country != "de" || rows[0].Device != "Mobile" || rows[0].Browser != "Safari" {
		t.Fatalf("first row detail: %+v", rows[0])
	}
	if rows[0].Goal != "" {
		t.Errorf("a row named \"pageview\" became a goal called %q", rows[0].Goal)
	}
	if rows[1].Goal != "signup" {
		t.Errorf("a real goal was lost: %+v", rows[1])
	}

	// Plausible-shaped CSV: utm_ prefixes, "timestamp", "name".
	csvIn := "timestamp,url,visitor_id,name,utm_source,utm_medium,utm_campaign\n" +
		"2026-09-22T10:00:00Z,https://site.com/docs,v7,pageview,newsletter,email,launch\n"
	rows, err = read(strings.NewReader(csvIn), "")
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Source != "newsletter" || rows[0].Medium != "email" || rows[0].Campaign != "launch" {
		t.Fatalf("csv row: %+v", rows)
	}
	e, ok := toEvent("s1", rows[0], 0)
	if !ok {
		t.Fatal("a valid row was skipped")
	}
	if e.Path != "/docs" {
		t.Errorf("a full URL did not become a path: %q", e.Path)
	}

	// trckable's own names still win where both are present.
	rows, _ = read(strings.NewReader(`{"ts":"2026-09-22T10:00:00Z","timestamp":"1999-01-01","path":"/a","url":"/b"}`), "")
	if rows[0].Path != "/a" || rows[0].TS != "2026-09-22T10:00:00Z" {
		t.Fatalf("our own names lost: %+v", rows[0])
	}
}

// ga4Event is one row as BigQuery's newline-delimited JSON export writes it:
// integers as strings, parameters as a key/value list, nulls everywhere.
func ga4Event(name, ts, visitor, page, ref, extra string) string {
	params := `{"key":"ga_session_id","value":{"string_value":null,"int_value":"1757000000","float_value":null,"double_value":null}}`
	if page != "" {
		params += `,{"key":"page_location","value":{"string_value":"` + page + `","int_value":null,"float_value":null,"double_value":null}}`
	}
	if ref != "" {
		params += `,{"key":"page_referrer","value":{"string_value":"` + ref + `","int_value":null,"float_value":null,"double_value":null}}`
	}
	return `{"event_date":"20260910","event_timestamp":"` + ts + `","event_name":"` + name + `","event_params":[` + params + `],` +
		`"user_pseudo_id":"` + visitor + `","privacy_info":{"analytics_storage":null,"ads_storage":null,"uses_transient_token":"No"},` +
		`"device":{"category":"mobile","mobile_brand_name":"Apple","operating_system":"iOS","language":"de-de","web_info":{"browser":"Safari","browser_version":"26.0","hostname":"example.com"}},` +
		`"geo":{"city":"Munich","country":"Germany","continent":"Europe","region":"Bavaria","sub_continent":"Western Europe","metro":"(not set)"},` +
		`"traffic_source":{"name":"(direct)","medium":"(none)","source":"(direct)"}` + extra + `}`
}

func TestImportGA4BigQueryExport(t *testing.T) {
	in := strings.NewReader(strings.Join([]string{
		ga4Event("session_start", "1757498400000000", "123.456", "https://example.com/?utm_source=newsletter&utm_medium=email", "", ""),
		ga4Event("first_visit", "1757498400000001", "123.456", "https://example.com/", "", ""),
		ga4Event("page_view", "1757498400000002", "123.456", "https://example.com/?utm_source=newsletter&utm_medium=email&email=a@b.c", "https://mail.google.com/", ""),
		ga4Event("page_view", "1757498460000000", "123.456", "https://example.com/pricing#plans", "https://example.com/", ""),
		ga4Event("scroll", "1757498470000000", "123.456", "https://example.com/pricing", "", ""),
		ga4Event("sign_up", "1757498520000000", "123.456", "https://example.com/pricing", "", ""),
		// A later visit: collected_traffic_source says where this one came from;
		// traffic_source still names the first visit and must not be used.
		ga4Event("page_view", "1757584800000000", "123.456", "https://example.com/blog/post", "https://www.bing.com/",
			`,"collected_traffic_source":{"manual_campaign_name":"autumn","manual_source":"bing","manual_medium":"cpc","gclid":null}`),
	}, "\n") + "\n")
	log := &fakeLog{}
	res, err := Run(context.Background(), log, "s1", in, "")
	if err != nil {
		t.Fatal(err)
	}
	if res.Rows != 4 || res.Ignored != 3 || res.Skipped != 0 {
		t.Fatalf("rows %d ignored %d skipped %d", res.Rows, res.Ignored, res.Skipped)
	}
	land, inner, goal, later := log.events[0], log.events[1], log.events[2], log.events[3]

	if land.Kind != event.KindPageview || land.Path != "/" {
		t.Fatalf("landing: kind %d path %q", land.Kind, land.Path)
	}
	if got := time.UnixMilli(land.TS).UTC().Format(time.RFC3339); got != "2025-09-10T10:00:00Z" {
		t.Fatalf("microsecond timestamp read as %s", got)
	}
	if land.Country != "DE" || land.Region != "Bavaria" || land.City != "Munich" {
		t.Fatalf("geo: %q %q %q", land.Country, land.Region, land.City)
	}
	if land.Device != "Mobile" || land.Browser != "Safari" || land.OS != "iOS" {
		t.Fatalf("device: %q %q %q", land.Device, land.Browser, land.OS)
	}
	if land.RefHost != "mail.google.com" || land.UTMSource != "newsletter" || land.UTMMedium != "email" || land.Channel != "Email" {
		t.Fatalf("landing source: ref %q utm %q/%q channel %q", land.RefHost, land.UTMSource, land.UTMMedium, land.Channel)
	}
	// The query string is gone: it carried an email address.
	if inner.Path != "/pricing" || inner.RefHost != "" {
		t.Fatalf("inner page: path %q ref %q (a same-site referrer is not a source)", inner.Path, inner.RefHost)
	}
	if goal.Kind != event.KindGoal || goal.Goal != "sign_up" {
		t.Fatalf("goal: kind %d name %q", goal.Kind, goal.Goal)
	}
	if later.UTMSource != "bing" || later.UTMMedium != "cpc" || later.UTMCampaign != "autumn" || later.Channel != "Paid" {
		t.Fatalf("later visit: %q/%q/%q channel %q", later.UTMSource, later.UTMMedium, later.UTMCampaign, later.Channel)
	}
	if land.Visitor != later.Visitor {
		t.Fatal("one user_pseudo_id became two visitors")
	}
}

func TestCountryNames(t *testing.T) {
	for name, want := range map[string]string{
		"Germany": "DE", "United States": "US", "United Kingdom": "GB", "Türkiye": "TR", "Turkey": "TR",
		"Côte d’Ivoire": "CI", "Cote d'Ivoire": "CI", "Bosnia & Herzegovina": "BA", "Bosnia and Herzegovina": "BA",
		"Hong Kong": "HK", "South Korea": "KR", "Czechia": "CZ", "Myanmar (Burma)": "MM", "Congo - Kinshasa": "CD",
		"St. Lucia": "LC", "Kosovo": "XK", "de": "DE", "(not set)": "", "Atlantis": "",
	} {
		if got := countryCode(notSet(name)); got != want {
			t.Errorf("%q: got %q, want %q", name, got, want)
		}
	}
}
