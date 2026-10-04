package query

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/duck"
)

func importedRig(t *testing.T, extra ...string) Q {
	t.Helper()
	st, err := duck.Open(context.Background(), filepath.Join(t.TempDir(), "i.duckdb"), duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	stmts := []string{
		// Three imported days, with a page each, and a day of another site.
		`INSERT INTO imported_daily VALUES ('s1', DATE '2024-01-01', 'total', '', 10, 8, 30)`,
		`INSERT INTO imported_daily VALUES ('s1', DATE '2024-01-02', 'total', '', 20, 15, 50)`,
		`INSERT INTO imported_daily VALUES ('s1', DATE '2024-01-03', 'total', '', 30, 25, 90)`,
		`INSERT INTO imported_daily VALUES ('s1', DATE '2024-01-01', 'page', '/', 5, 4, 12)`,
		`INSERT INTO imported_daily VALUES ('s1', DATE '2024-01-02', 'page', '/', 5, 4, 12)`,
		`INSERT INTO imported_daily VALUES ('s1', DATE '2024-01-02', 'country', 'DE', 20, 15, 50)`,
		`INSERT INTO imported_daily VALUES ('s2', DATE '2024-01-01', 'total', '', 999, 999, 999)`,
	}
	for _, q := range append(stmts, extra...) {
		if _, err := st.DB.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	return Q{DB: st.DB}
}

func jan(from, to int) Params {
	return Params{Site: "s1", TZ: "UTC", Bucket: "day", Limit: 10,
		From: time.Date(2024, 1, from, 0, 0, 0, 0, time.UTC), To: time.Date(2024, 1, to+1, 0, 0, 0, 0, time.UTC)}
}

func TestImportedDaysJoinAReportWhenTheSiteHasNoEventYet(t *testing.T) {
	q := importedRig(t)
	res, err := q.Report(context.Background(), jan(1, 5))
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "visitors", res.KPIs.Visitors, int64(48))
	eq(t, "sessions", res.KPIs.Sessions, int64(60))
	eq(t, "pageviews", res.KPIs.Pageviews, int64(170))
	if res.Imported == nil || res.Imported.Days != 3 || res.Imported.From != "2024-01-01" || res.Imported.To != "2024-01-03" {
		t.Errorf("imported %+v", res.Imported)
	}
	marked := 0
	for _, p := range res.Series {
		if p.Imported {
			marked++
		}
	}
	eq(t, "series points marked imported", marked, 3)
	eq(t, "series length", len(res.Series), 5)
	eq(t, "the second day", res.Series[1].Visitors, int64(15))
	if len(res.Dims["page"]) != 1 || res.Dims["page"][0].Value != "/" || res.Dims["page"][0].Visitors != 8 {
		t.Errorf("pages %+v", res.Dims["page"])
	}
	if len(res.Dims["country"]) != 1 || res.Dims["country"][0].Value != "DE" {
		t.Errorf("countries %+v", res.Dims["country"])
	}
}

func TestImportedDaysCountOnlyBeforeTheFirstRecordedEvent(t *testing.T) {
	// The site recorded its first event of its own on 3 January.
	q := importedRig(t, `INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id) VALUES (1, 's1', TIMESTAMP '2024-01-03 09:00:00', 1, 1, 1)`)
	res, err := q.Report(context.Background(), jan(1, 5))
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "visitors", res.KPIs.Visitors, int64(8+15)) // 1 and 2 January imported; the 3rd is the site's own (no sessions row here)
	if res.Imported == nil || res.Imported.Days != 2 || res.Imported.To != "2024-01-02" {
		t.Errorf("imported %+v: the day of the first event and after are the site's own", res.Imported)
	}
	eq(t, "the 3rd", res.Series[2].Visitors, int64(0))
	if res.Series[2].Imported {
		t.Error("the day of the first event is marked imported")
	}
}

func TestImportedDaysNeverCountTwiceWithImportedEvents(t *testing.T) {
	// `trckabled import` already put events on 2 January: that day is its.
	q := importedRig(t,
		`INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id, imported) VALUES (1, 's1', TIMESTAMP '2024-01-02 09:00:00', 1, 1, 1, true)`)
	res, err := q.Report(context.Background(), jan(1, 5))
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "visitors", res.KPIs.Visitors, int64(8+25))
	if res.Imported == nil || res.Imported.Days != 2 {
		t.Errorf("imported %+v", res.Imported)
	}
}

func TestImportedDaysStayOutOfFilteredAndHourlyReports(t *testing.T) {
	q := importedRig(t)
	p := jan(1, 5)
	p.Filters = []Filter{{Dim: "country", Value: "DE"}}
	res, err := q.Report(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	if res.Imported != nil || res.KPIs.Visitors != 0 {
		t.Errorf("a filtered report has imported days: %+v %+v", res.Imported, res.KPIs)
	}
	p = jan(1, 5)
	p.Bucket = "hour"
	if res, err = q.Report(context.Background(), p); err != nil || res.Imported != nil {
		t.Errorf("an hourly report has imported days: %v %+v", err, res.Imported)
	}
}

func TestImportedDaysOutsideThePeriodOrOfAnotherSiteAreLeftOut(t *testing.T) {
	q := importedRig(t)
	res, err := q.Report(context.Background(), jan(2, 2))
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "visitors", res.KPIs.Visitors, int64(15))
	other := jan(1, 5)
	other.Site = "s3"
	if res, err = q.Report(context.Background(), other); err != nil || res.Imported != nil {
		t.Errorf("a site with nothing imported: %v %+v", err, res.Imported)
	}
}

func TestImportedDaysInWeeks(t *testing.T) {
	q := importedRig(t)
	p := jan(1, 14)
	p.Bucket = "week"
	res, err := q.Report(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "visitors", res.KPIs.Visitors, int64(48))
	var got int64
	for _, pt := range res.Series {
		if pt.Imported {
			got += pt.Visitors
		}
	}
	eq(t, "visitors in the marked weeks", got, int64(48))
}

func TestImportedHaveAndFirstRecordedDay(t *testing.T) {
	q := importedRig(t, `INSERT INTO events (seq, site_id, ts, kind, visitor_id, session_id) VALUES (1, 's1', TIMESTAMP '2024-01-03 23:30:00', 1, 1, 1)`)
	ctx := context.Background()
	if ok, err := q.ImportedHave(ctx, "s1", "2024-01-01", "2024-01-03"); err != nil || !ok {
		t.Errorf("three days there: %v %v", ok, err)
	}
	if ok, _ := q.ImportedHave(ctx, "s1", "2024-01-01", "2024-01-04"); ok {
		t.Error("a missing day counts as there")
	}
	if ok, _ := q.ImportedHave(ctx, "s9", "2024-01-01", "2024-01-03"); ok {
		t.Error("another site's days count")
	}
	if d, _ := q.FirstRecordedDay(ctx, "s1", "UTC"); d != "2024-01-03" {
		t.Errorf("first day %q", d)
	}
	if d, _ := q.FirstRecordedDay(ctx, "s1", "Asia/Tokyo"); d != "2024-01-04" {
		t.Errorf("first day in Tokyo %q", d)
	}
	if d, _ := q.FirstRecordedDay(ctx, "s2", "UTC"); d != "" {
		t.Errorf("a site with no events: %q", d)
	}
}
