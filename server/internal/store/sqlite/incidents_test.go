package sqlite

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
)

func openIncidents(t *testing.T) (*Store, string) {
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

// One incident is open at most, a repeated start changes nothing, and
// closing keeps what the estimate said (or nothing).
func TestIncidentOpenOnceAndClose(t *testing.T) {
	ctx := context.Background()
	st, site := openIncidents(t)
	if made, err := st.StartIncident(ctx, site, "quiet", 1000, "no visits"); err != nil || !made {
		t.Fatalf("start: %v %v", made, err)
	}
	if made, _ := st.StartIncident(ctx, site, "quiet", 1000, "no visits"); made {
		t.Fatal("the same start was recorded twice")
	}
	if made, _ := st.StartIncident(ctx, site, "down", 2000, "x"); made {
		t.Fatal("a second incident opened while one is open")
	}
	open, err := st.OpenIncident(ctx, site)
	if err != nil || open == nil || open.Kind != "quiet" || open.EndedAt != nil || open.Expected != nil {
		t.Fatalf("open %+v %v", open, err)
	}
	if err := st.MarkIncidentDown(ctx, open.ID, "connection refused"); err != nil {
		t.Fatal(err)
	}
	exp := int64(340)
	if err := st.EndIncident(ctx, open.ID, 5000, &exp); err != nil {
		t.Fatal(err)
	}
	if again, _ := st.OpenIncident(ctx, site); again != nil {
		t.Fatalf("still open: %+v", again)
	}
	list, _ := st.Incidents(ctx, site, 5, 0, 0, 0)
	if len(list) != 1 || list[0].Kind != "down" || list[0].Cause != "connection refused" || *list[0].EndedAt != 5000 || *list[0].Expected != 340 {
		t.Fatalf("list %+v", list)
	}
	// Closing again does not move the end.
	_ = st.EndIncident(ctx, open.ID, 9000, nil)
	if list, _ = st.Incidents(ctx, site, 5, 0, 0, 0); *list[0].EndedAt != 5000 || list[0].Expected == nil {
		t.Fatalf("a closed incident changed: %+v", list[0])
	}
	// A new one can open once the old one closed.
	if made, _ := st.StartIncident(ctx, site, "quiet", 8000, "no visits"); !made {
		t.Fatal("no new incident after the close")
	}
}

// Newest first, paged by the start of the last one, and by period.
func TestIncidentsPagedAndByPeriod(t *testing.T) {
	ctx := context.Background()
	st, site := openIncidents(t)
	for i := int64(1); i <= 4; i++ {
		_, _ = st.StartIncident(ctx, site, "quiet", i*1000, "no visits")
		open, _ := st.OpenIncident(ctx, site)
		_ = st.EndIncident(ctx, open.ID, i*1000+100, nil)
	}
	page, _ := st.Incidents(ctx, site, 2, 0, 0, 0)
	if len(page) != 2 || page[0].StartedAt != 4000 || page[1].StartedAt != 3000 {
		t.Fatalf("first page %+v", page)
	}
	rest, _ := st.Incidents(ctx, site, 2, page[1].StartedAt, 0, 0)
	if len(rest) != 2 || rest[0].StartedAt != 2000 || rest[1].StartedAt != 1000 {
		t.Fatalf("next page %+v", rest)
	}
	// An incident that began before the period but ended inside it counts.
	in, _ := st.Incidents(ctx, site, 50, 0, 2050, 3500)
	if len(in) != 2 || in[0].StartedAt != 3000 || in[1].StartedAt != 2000 {
		t.Fatalf("period %+v", in)
	}
}

func TestIncidentNote(t *testing.T) {
	ctx := context.Background()
	st, site := openIncidents(t)
	_, _ = st.StartIncident(ctx, site, "down", 1000, "x")
	open, _ := st.OpenIncident(ctx, site)
	got, err := st.SetIncidentNote(ctx, site, open.ID, "  Hosting migration  ")
	if err != nil || got.Note != "Hosting migration" {
		t.Fatalf("note %+v %v", got, err)
	}
	if got, _ = st.SetIncidentNote(ctx, site, open.ID, strings.Repeat("é", 300)); len([]rune(got.Note)) != MaxIncidentNote {
		t.Fatalf("a long note was not cut: %d", len([]rune(got.Note)))
	}
	if _, err := st.SetIncidentNote(ctx, "tkb_other", open.ID, "mine"); err == nil {
		t.Fatal("another site's incident was changed")
	}
}

// Deleting a site deletes its incidents.
func TestIncidentsGoWithTheSite(t *testing.T) {
	ctx := context.Background()
	st, site := openIncidents(t)
	_, _ = st.StartIncident(ctx, site, "down", 1000, "x")
	if _, err := st.DeleteSite(ctx, site); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := st.DB.QueryRowContext(ctx, `SELECT count(*) FROM incidents`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("incidents left: %d %v", n, err)
	}
}
