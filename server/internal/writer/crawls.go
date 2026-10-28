package writer

import (
	"context"
	"database/sql"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

type crawlKey struct{ site, day, name, kind, path string }

// countCrawls adds a batch of crawler hits to the per-day counters, in the
// batch's transaction, by day in the site's time zone.
func (w *Writer) countCrawls(ctx context.Context, conn *sql.Conn, crawls []event.Event) error {
	if len(crawls) == 0 {
		return nil
	}
	zones := map[string]*time.Location{}
	sums := map[crawlKey][3]uint64{}
	for i := range crawls {
		e := &crawls[i]
		loc, ok := zones[e.Site]
		if !ok {
			loc = w.siteZone(ctx, e.Site)
			zones[e.Site] = loc
		}
		k := crawlKey{e.Site, time.UnixMilli(e.TS).In(loc).Format(time.DateOnly), e.Browser, e.OS, e.Path}
		v := sums[k]
		v[0]++
		switch e.Goal {
		case "error":
			v[1]++
		case "blocked":
			v[2]++
		}
		sums[k] = v
	}
	for k, v := range sums {
		if _, err := conn.ExecContext(ctx, `
			INSERT INTO crawler_hits (site_id, day, name, kind, path, hits, errors, blocked)
			VALUES (?, CAST(? AS DATE), ?, ?, ?, ?, ?, ?)
			ON CONFLICT DO UPDATE SET hits = hits + excluded.hits, errors = errors + excluded.errors,
				blocked = blocked + excluded.blocked`,
			k.site, k.day, k.name, k.kind, k.path, v[0], v[1], v[2]); err != nil {
			return err
		}
	}
	return nil
}

// siteZone is the site's time zone for its crawler days; UTC when it has
// none or an unknown one.
func (w *Writer) siteZone(ctx context.Context, site string) *time.Location {
	if w.opts.SiteZone == nil {
		return time.UTC
	}
	loc, err := time.LoadLocation(w.opts.SiteZone(ctx, site))
	if err != nil {
		return time.UTC
	}
	return loc
}
