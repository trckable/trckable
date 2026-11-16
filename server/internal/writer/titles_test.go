package writer

import (
	"context"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

func titled(site string, id uint64, ts int64, path, title string) event.Event {
	e := pv(site, id, id, ts)
	e.Path, e.Title = path, title
	return e
}

func (e *env) title(t *testing.T, site, path string) (title string) {
	t.Helper()
	err := e.store.DB.QueryRow(`SELECT coalesce(max(title), '') FROM page_titles WHERE site_id = ? AND path = ?`, site, path).Scan(&title)
	if err != nil {
		t.Fatal(err)
	}
	return title
}

// The latest title of a page is kept once, however many views carried it, and
// an older view arriving late does not take its place.
func TestPageTitleKeepsTheLatest(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	w, stop := e.start(t, Options{})
	defer stop()
	base := time.Now().Add(-time.Hour).UnixMilli()
	e.append(t, titled("s1", 1, base, "/pricing", "Pricing"))
	e.append(t, titled("s1", 2, base+10, "/pricing", "Pricing"))
	e.append(t, titled("s1", 3, base+20, "/pricing", "Plans and pricing"))
	e.append(t, titled("s1", 4, base+30, "/about", ""))
	e.append(t, titled("s2", 5, base+40, "/pricing", "Other site"))
	waitApplied(t, w, 5)
	if got := e.title(t, "s1", "/pricing"); got != "Plans and pricing" {
		t.Fatalf("title: want the latest, got %q", got)
	}
	if n := e.count(t, `SELECT count(*) FROM page_titles WHERE site_id = 's1'`); n != 1 {
		t.Fatalf("rows for s1: want 1 (no title, no row), got %d", n)
	}
	if got := e.title(t, "s2", "/pricing"); got != "Other site" {
		t.Fatalf("a site's titles are its own, got %q", got)
	}

	// A retry from before the stored view, in a later batch, changes nothing.
	e.append(t, titled("s1", 6, base-5000, "/pricing", "Old name"))
	waitApplied(t, w, 6)
	if got := e.title(t, "s1", "/pricing"); got != "Plans and pricing" {
		t.Fatalf("an older view replaced the title: %q", got)
	}
	// A newer one does.
	e.append(t, titled("s1", 7, base+50, "/pricing", "Pricing 2027"))
	waitApplied(t, w, 7)
	if got := e.title(t, "s1", "/pricing"); got != "Pricing 2027" {
		t.Fatalf("a newer view should replace it, got %q", got)
	}
}

// Titles are not on the event rows, and only pageviews carry one.
func TestPageTitleNotOnEvents(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	w, stop := e.start(t, Options{})
	defer stop()
	g := titled("s1", 1, time.Now().Add(-time.Hour).UnixMilli(), "/x", "A goal title")
	g.Kind, g.Goal = event.KindGoal, "signup"
	e.append(t, g)
	waitApplied(t, w, 1)
	if n := e.count(t, `SELECT count(*) FROM page_titles`); n != 0 {
		t.Fatalf("a goal must not write a title, got %d rows", n)
	}
}

// Deleting a site and its retention take the titles with them; a title still in
// use comes back with its next view even though the writer remembered it.
func TestPageTitlesFollowTheSite(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	w, stop := e.start(t, Options{})
	defer stop()
	ctx := context.Background()
	now := time.Now()
	old := now.Add(-48 * time.Hour).UnixMilli()
	e.append(t, titled("s1", 1, old, "/old", "Old page"))
	e.append(t, titled("s1", 2, now.Add(-time.Hour).UnixMilli(), "/new", "New page"))
	e.append(t, titled("s2", 3, now.Add(-time.Hour).UnixMilli(), "/new", "Other"))
	waitApplied(t, w, 3)

	if _, err := w.PruneBefore(ctx, "s1", now.Add(-24*time.Hour).UnixMilli()); err != nil {
		t.Fatal(err)
	}
	if got := e.title(t, "s1", "/old"); got != "" {
		t.Fatalf("retention kept %q", got)
	}
	if got := e.title(t, "s1", "/new"); got != "New page" {
		t.Fatalf("retention took a recent title: %q", got)
	}

	// The same title again after a prune is written again (the memory was cleared).
	e.append(t, titled("s1", 4, now.UnixMilli(), "/old", "Old page"))
	waitApplied(t, w, 4)
	if got := e.title(t, "s1", "/old"); got != "Old page" {
		t.Fatalf("a title read again did not come back: %q", got)
	}

	if _, _, err := w.PurgeSite(ctx, "s1"); err != nil {
		t.Fatal(err)
	}
	if n := e.count(t, `SELECT count(*) FROM page_titles WHERE site_id = 's1'`); n != 0 {
		t.Fatalf("deleting the site left %d titles", n)
	}
	if got := e.title(t, "s2", "/new"); got != "Other" {
		t.Fatalf("another site's title was removed: %q", got)
	}
}
