package api

import (
	"encoding/json"
	"os"
	"testing"
	"time"
)

// The dashboard offers the periods in this file and the server answers the
// same ones: a change on one side without the other fails here.
func TestSharePeriodsAgreeWithTheDashboards(t *testing.T) {
	raw, err := os.ReadFile("../../../dashboard/src/lib/sharePeriods.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Default string `json:"default"`
		Periods []struct {
			ID     string `json:"id"`
			Days   int    `json:"days"`
			Months int    `json:"months"`
		} `json:"periods"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	if f.Default != shareDefaultPeriod || len(f.Periods) != len(sharePeriods) {
		t.Fatalf("default %q / %d periods in the dashboard's list, %q / %d here", f.Default, len(f.Periods), shareDefaultPeriod, len(sharePeriods))
	}
	for i, p := range f.Periods {
		if got := sharePeriods[i]; got.ID != p.ID || got.Days != p.Days || got.Months != p.Months {
			t.Errorf("period %d: dashboard %+v, server %+v", i, p, got)
		}
	}
}

func TestSharePeriodStarts(t *testing.T) {
	today := time.Date(2026, 11, 16, 15, 0, 0, 0, time.UTC)
	for id, want := range map[string]string{"7d": "2026-11-10", "30d": "2026-10-18", "12mo": "2025-11-17"} {
		for _, p := range sharePeriods {
			if p.ID == id && p.start(today).Format("2006-01-02") != want {
				t.Errorf("%s starts %s, want %s", id, p.start(today).Format("2006-01-02"), want)
			}
		}
	}
}

// A link's address cannot be edited into another range: any dates, any
// comparison, any bucket come back as one of the offered periods ending today.
func TestSharedReportOnlyAnswersTheOfferedPeriods(t *testing.T) {
	g := newRig(t)
	owner := client()
	g.setup(t, owner)
	_, made := do(t, owner, "POST", g.srv.URL+"/api/v1/sites/"+g.site+"/shares", `{"name":"Client"}`, csrf, "1")
	url, _ := made["url"].(string)
	reader := client()
	if code, _ := do(t, reader, "POST", g.srv.URL+"/api/v1/share/open", `{"token":"`+url[len(url)-26:]+`"}`); code != 200 {
		t.Fatal("open")
	}
	read := func(q string) map[string]any {
		code, out := do(t, reader, "GET", g.srv.URL+"/api/v1/share/report"+q, "")
		if code != 200 {
			t.Fatalf("%s: %d %v", q, code, out)
		}
		return out
	}
	days := func(out map[string]any) int {
		from, _ := time.Parse("2006-01-02", out["from"].(string))
		to, _ := time.Parse("2006-01-02", out["to"].(string))
		return int(to.Sub(from).Hours()/24) + 1
	}
	today := g.api.Now().UTC().Format("2006-01-02")
	for q, want := range map[string]int{
		"":                               30,
		"?from=2020-01-01&to=2026-09-22": 365,
		"?from=2026-06-01&to=2026-06-01": 7,
		"?from=2026-10-10&to=2026-10-24": 30,
		"?from=2026-11-10&to=2026-11-16&bucket=hour": 7,
	} {
		out := read(q)
		got := days(out)
		if q == "?from=2020-01-01&to=2026-09-22" {
			if got < 364 || got > 366 {
				t.Errorf("%s: %d days", q, got)
			}
		} else if got != want {
			t.Errorf("%s: %d days, want %d", q, got, want)
		}
		if out["to"] != today {
			t.Errorf("%s: ends %v, not today (%s)", q, out["to"], today)
		}
	}
	out := read("?compare=previous&cfrom=2026-01-01&cto=2026-01-31")
	if _, has := out["previous"]; has {
		t.Error("a link has no comparison")
	}
}
