package query

import (
	"context"

	"github.com/trckable/trckable/server/internal/event"
)

// SetupFacts are the two counts the setup checklist reads from the analytics
// store.
type SetupFacts struct {
	Paths    int64 // distinct paths with a pageview, up to 3
	Crawlers bool  // any AI-crawler hit was ever recorded
}

// Setup reads what the checklist needs. Paths stops counting at 3: the
// checklist asks "one path, or two or more".
func (q Q) Setup(ctx context.Context, site string, skipPaths bool) (SetupFacts, error) {
	var f SetupFacts
	if !skipPaths {
		if err := q.DB.QueryRowContext(ctx, `SELECT count(*) FROM (SELECT DISTINCT path FROM events WHERE site_id = ? AND kind = ? LIMIT 3)`, site, event.KindPageview).Scan(&f.Paths); err != nil {
			return f, err
		}
	}
	var n int64
	if err := q.DB.QueryRowContext(ctx, `SELECT count(*) FROM (SELECT 1 FROM crawler_hits WHERE site_id = ? LIMIT 1)`, site).Scan(&n); err != nil {
		return f, err
	}
	f.Crawlers = n > 0
	return f, nil
}
