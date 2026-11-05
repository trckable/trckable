package api

import (
	"context"
	"time"

	"github.com/trckable/trckable/server/internal/gsc"
	"github.com/trckable/trckable/server/internal/milestones"
)

// searchHistory is how far back Milestones ask Google for the daily clicks:
// Search Console keeps about sixteen months.
const searchHistory = 480

// SearchDays is Google's clicks per day for a site, for the Search Console
// milestone: nil, nil when Search Console is not connected, so a site
// without it simply has none. It reads through the hour's cache the reports
// share. The last row is the data's own last day, two or three days back.
func (a *API) SearchDays(ctx context.Context, site string) ([]milestones.ClickDay, error) {
	c, err := a.Ctl.SearchConsoleOf(ctx, site)
	if err != nil || c.Property == "" {
		return nil, nil
	}
	si, err := a.Ctl.SiteInfo(ctx, site)
	if err != nil {
		return nil, err
	}
	loc, err := time.LoadLocation(si.Timezone)
	if err != nil {
		loc = time.UTC
	}
	last := a.Now().In(loc)
	last = time.Date(last.Year(), last.Month(), last.Day(), 0, 0, 0, 0, time.UTC)
	from := last.AddDate(0, 0, -searchHistory)
	body, _, err := a.searchBody(ctx, site, c, loc, gsc.Query{From: from, To: last, Dimension: "date", Limit: 1000}, from, last)
	if err != nil {
		return nil, err
	}
	rows, _ := body["rows"].([]gsc.Row)
	out := make([]milestones.ClickDay, 0, len(rows))
	for _, r := range rows {
		out = append(out, milestones.ClickDay{Day: r.Key, Clicks: r.Clicks})
	}
	return out, nil
}
