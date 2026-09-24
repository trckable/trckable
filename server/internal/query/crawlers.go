package query

import (
	"context"
	"time"
)

// CrawlerReport is what the robots did: how many hits in each category, a
// series per crawler, and the pages they asked for.
type CrawlerReport struct {
	Kinds   map[string]int64 `json:"kinds"`  // answer | index | train
	Series  []CrawlerSeries  `json:"series"` // one line per crawler
	Pages   []Row            `json:"pages"`  // most crawled paths
	Total   int64            `json:"total"`
	Errors  int64            `json:"errors"`  // hits that returned 4xx/5xx
	Buckets []string         `json:"buckets"` // local wall clock, like the main chart
}

// CrawlerSeries is one crawler's hits over the period.
type CrawlerSeries struct {
	Name   string  `json:"name"`
	Kind   string  `json:"kind"`
	Total  int64   `json:"total"`
	Values []int64 `json:"values"`
}

// Crawlers reads the crawler hits for a period, one line per crawler.
func (q Q) Crawlers(ctx context.Context, p Params) (*CrawlerReport, error) {
	conn, err := q.conn(ctx, p.Site)
	if err != nil {
		return nil, err
	}
	defer q.done(conn)
	tz := p.TZ
	if tz == "" {
		tz = "UTC"
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc, tz = time.UTC, "UTC"
	}
	out := &CrawlerReport{Kinds: map[string]int64{}}

	// The buckets are days in the site's own timezone, like every other chart.
	for d := p.From; d.Before(p.To); d = d.AddDate(0, 0, 1) {
		out.Buckets = append(out.Buckets, d.In(loc).Format("2006-01-02T15:04"))
	}
	index := map[string]int{}
	for i, b := range out.Buckets {
		index[b] = i
	}

	rows, err := conn.QueryContext(ctx, `
		SELECT coalesce(browser, '') AS name, coalesce(os, '') AS kind,
		       strftime(timezone(?, ts), '%Y-%m-%dT00:00') AS bucket,
		       count(*) AS hits,
		       count(*) FILTER (WHERE goal = 'error') AS errors
		FROM events
		WHERE site_id = ? AND kind = 4 AND ts >= ? AND ts < ?
		GROUP BY 1, 2, 3`, tz, p.Site, p.From, p.To)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byName := map[string]*CrawlerSeries{}
	for rows.Next() {
		var name, kind, bucket string
		var hits, errs int64
		if err := rows.Scan(&name, &kind, &bucket, &hits, &errs); err != nil {
			return nil, err
		}
		s := byName[name]
		if s == nil {
			s = &CrawlerSeries{Name: name, Kind: kind, Values: make([]int64, len(out.Buckets))}
			byName[name] = s
		}
		if i, ok := index[bucket]; ok {
			s.Values[i] += hits
		}
		s.Total += hits
		out.Kinds[kind] += hits
		out.Total += hits
		out.Errors += errs
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, s := range byName {
		out.Series = append(out.Series, *s)
	}
	// Busiest crawler first: the list doubles as the legend.
	sortRowsDesc(out.Series)

	pages, err := conn.QueryContext(ctx, `
		SELECT coalesce(path, '') AS page, count(*) AS hits
		FROM events WHERE site_id = ? AND kind = 4 AND ts >= ? AND ts < ?
		GROUP BY 1 ORDER BY hits DESC LIMIT ?`, p.Site, p.From, p.To, max(p.Limit, 10))
	if err != nil {
		return nil, err
	}
	defer pages.Close()
	for pages.Next() {
		var r Row
		if err := pages.Scan(&r.Value, &r.Visitors); err != nil {
			return nil, err
		}
		out.Pages = append(out.Pages, r)
	}
	return out, pages.Err()
}

func sortRowsDesc(s []CrawlerSeries) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j].Total > s[j-1].Total; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
}
