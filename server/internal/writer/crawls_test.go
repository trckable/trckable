package writer

import (
	"context"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

func crawl(id uint64, ts int64, name, kind, path string) event.Event {
	return event.Event{Site: "s1", Kind: event.KindCrawler, EventID: id, TS: ts, Path: path, Browser: name, OS: kind}
}

// Crawler hits become per-day counters, never events or sessions.
func TestCrawlsAreCounters(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	day := time.Date(2026, 9, 10, 9, 0, 0, 0, time.UTC).UnixMilli()
	e.append(t, crawl(1, day, "OpenAI", "train", "/"))
	e.append(t, crawl(2, day+1000, "OpenAI", "train", "/"))
	e.append(t, crawl(3, day+2000, "Anthropic", "answer", "/docs"))
	e.append(t, crawl(3, day+2000, "Anthropic", "answer", "/docs")) // a repeat report
	e.append(t, pv("s1", 7, 9, day))
	e.runUntil(t, 5)

	if n := e.count(t, `SELECT count(*) FROM events WHERE kind = 4`); n != 0 {
		t.Fatalf("crawler events stored: %d", n)
	}
	if n := e.count(t, `SELECT count(*) FROM events`); n != 1 {
		t.Fatalf("events: want the one pageview, got %d", n)
	}
	if n := e.count(t, `SELECT hits FROM crawler_hits WHERE name = 'OpenAI' AND path = '/' AND day = DATE '2026-09-10'`); n != 2 {
		t.Fatalf("OpenAI hits: want 2, got %d", n)
	}
	if n := e.count(t, `SELECT sum(hits) FROM crawler_hits`); n != 3 {
		t.Fatalf("all hits: want 3 (repeat deduped), got %d", n)
	}
}

func TestCrawlsDayInTheSiteZone(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	w := New(e.log, e.store, Options{FlushEvery: 20 * time.Millisecond, SiteZone: func(context.Context, string) string { return "Europe/Berlin" }})
	late := time.Date(2026, 9, 10, 23, 30, 0, 0, time.UTC).UnixMilli()
	e.append(t, crawl(1, late, "OpenAI", "train", "/"))
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.Run(ctx) }()
	waitApplied(t, w, 1)
	cancel()
	<-done
	if n := e.count(t, `SELECT count(*) FROM crawler_hits WHERE day = DATE '2026-09-11'`); n != 1 {
		t.Fatalf("want the hit on the 11th (Berlin), got %d rows", n)
	}
}

// Refused visits and broken pages are counted apart.
func TestCrawlsCountBlockedAndBroken(t *testing.T) {
	e := newEnv(t, t.TempDir())
	defer e.close()
	day := time.Date(2026, 9, 10, 9, 0, 0, 0, time.UTC).UnixMilli()
	c1, c2, c3, c4 := crawl(1, day, "OpenAI", "answer", "/"), crawl(2, day+1000, "OpenAI", "answer", "/"), crawl(3, day+2000, "OpenAI", "answer", "/"), crawl(4, day+3000, "OpenAI", "answer", "/")
	c1.Goal, c2.Goal, c3.Goal = "blocked", "blocked", "error"
	e.append(t, c1)
	e.append(t, c2)
	e.append(t, c3)
	e.append(t, c4)
	e.runUntil(t, 4)
	if n := e.count(t, `SELECT blocked FROM crawler_hits WHERE name = 'OpenAI'`); n != 2 {
		t.Fatalf("blocked: want 2, got %d", n)
	}
	if n := e.count(t, `SELECT errors FROM crawler_hits WHERE name = 'OpenAI'`); n != 1 {
		t.Fatalf("errors: want 1, got %d", n)
	}
	if n := e.count(t, `SELECT hits FROM crawler_hits WHERE name = 'OpenAI'`); n != 4 {
		t.Fatalf("hits: want 4, got %d", n)
	}
}
