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
	Errors  int64            `json:"errors"`  // hits on broken pages: 404, 5xx and the rest
	Blocked int64            `json:"blocked"` // hits the site's server or CDN turned away: 401, 403, 429
	Buckets []string         `json:"buckets"` // one per day
	Reads   []CrawlerRead    `json:"reads"`   // which crawler read which page
	Folded  int64            `json:"folded"`  // hits past fair use, counted without their page
	Failing []CrawlerFail    `json:"failing"` // each crawler's worst pages, at most crawlFailing apiece
}

// crawlFailing is how many failing pages one crawler lists.
const crawlFailing = 5

// CrawlerFail is a page one crawler could not read: turned away or broken,
// whichever happened more.
type CrawlerFail struct {
	Path  string `json:"path"`
	Name  string `json:"name"`
	Kind  string `json:"kind"`
	Count int64  `json:"count"`
	Why   string `json:"why"` // blocked | broken
}

// CrawlerRead is one crawler's hits on one page over the period.
type CrawlerRead struct {
	Path string `json:"path"`
	Name string `json:"name"`
	Kind string `json:"kind"`
	Hits int64  `json:"hits"`
}

// CrawlerSeries is one crawler's hits over the period.
type CrawlerSeries struct {
	Name    string  `json:"name"`
	Kind    string  `json:"kind"`
	Total   int64   `json:"total"`
	Blocked int64   `json:"blocked,omitempty"`
	Errors  int64   `json:"errors,omitempty"`
	Values  []int64 `json:"values"`
}

// Crawlers reads the crawler hits for a period, one line per crawler.
func (q Q) Crawlers(ctx context.Context, p Params) (*CrawlerReport, error) {
	conn, err := q.conn(ctx, p.Site)
	if err != nil {
		return nil, err
	}
	defer q.done(conn)
	loc, err := time.LoadLocation(p.TZ)
	if err != nil {
		loc = time.UTC
	}
	out := &CrawlerReport{Kinds: map[string]int64{}, Series: []CrawlerSeries{}, Pages: []Row{}, Buckets: []string{}, Reads: []CrawlerRead{}, Failing: []CrawlerFail{}}

	// Counters are kept per day in the site's timezone (the writer's
	// SiteZone), so the buckets are the period's days as it names them.
	from := p.From.In(loc).Format(time.DateOnly)
	to := p.To.In(loc).Add(-time.Nanosecond).AddDate(0, 0, 1).Format(time.DateOnly)
	for d := p.From.In(loc); d.Before(p.To); d = d.AddDate(0, 0, 1) {
		out.Buckets = append(out.Buckets, d.Format("2006-01-02")+"T00:00")
	}
	index := map[string]int{}
	for i, b := range out.Buckets {
		index[b] = i
	}

	rows, err := conn.QueryContext(ctx, `
		SELECT name, kind, strftime(day, '%Y-%m-%dT00:00') AS bucket,
		       sum(hits)::BIGINT, sum(errors)::BIGINT, sum(coalesce(blocked, 0))::BIGINT
		FROM crawler_hits
		WHERE site_id = ? AND day >= CAST(? AS DATE) AND day < CAST(? AS DATE)
		GROUP BY 1, 2, 3`, p.Site, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byName := map[string]*CrawlerSeries{}
	for rows.Next() {
		var name, kind, bucket string
		var hits, errs, blocked int64
		if err := rows.Scan(&name, &kind, &bucket, &hits, &errs, &blocked); err != nil {
			return nil, err
		}
		// One line per crawler and errand: OpenAI answering and OpenAI
		// training are two lines, each under its own tab.
		s := byName[name+"\x00"+kind]
		if s == nil {
			s = &CrawlerSeries{Name: name, Kind: kind, Values: make([]int64, len(out.Buckets))}
			byName[name+"\x00"+kind] = s
		}
		if i, ok := index[bucket]; ok {
			s.Values[i] += hits
		}
		s.Total += hits
		out.Kinds[kind] += hits
		out.Total += hits
		s.Errors += errs
		s.Blocked += blocked
		out.Errors += errs
		out.Blocked += blocked
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
		SELECT path, sum(hits)::BIGINT AS n
		FROM crawler_hits WHERE site_id = ? AND day >= CAST(? AS DATE) AND day < CAST(? AS DATE)
		GROUP BY 1 ORDER BY n DESC, 1 LIMIT ?`, p.Site, from, to, max(p.Limit, 10))
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
	if err := pages.Err(); err != nil {
		return nil, err
	}
	if err := conn.QueryRowContext(ctx, `
		SELECT coalesce(sum(hits), 0)::BIGINT
		FROM crawler_hits WHERE site_id = ? AND day >= CAST(? AS DATE) AND day < CAST(? AS DATE) AND path = ?`,
		p.Site, from, to, crawlOther).Scan(&out.Folded); err != nil {
		return nil, err
	}
	reads, err := conn.QueryContext(ctx, `
		SELECT path, name, kind, sum(hits)::BIGINT AS n
		FROM crawler_hits WHERE site_id = ? AND day >= CAST(? AS DATE) AND day < CAST(? AS DATE)
		GROUP BY 1, 2, 3 ORDER BY n DESC, 1, 2 LIMIT ?`, p.Site, from, to, max(p.Limit, 10)*3)
	if err != nil {
		return nil, err
	}
	defer reads.Close()
	for reads.Next() {
		var r CrawlerRead
		if err := reads.Scan(&r.Path, &r.Name, &r.Kind, &r.Hits); err != nil {
			return nil, err
		}
		out.Reads = append(out.Reads, r)
	}
	if err := reads.Err(); err != nil {
		return nil, err
	}
	// Each crawler's worst pages: where it was turned away or found a break.
	fails, err := conn.QueryContext(ctx, `
		SELECT path, name, kind, n, CASE WHEN b >= e THEN 'blocked' ELSE 'broken' END FROM (
			SELECT path, name, kind, sum(coalesce(blocked, 0))::BIGINT AS b, sum(errors)::BIGINT AS e,
			       (sum(coalesce(blocked, 0)) + sum(errors))::BIGINT AS n,
			       row_number() OVER (PARTITION BY name, kind
			           ORDER BY sum(coalesce(blocked, 0)) + sum(errors) DESC, path) AS r
			FROM crawler_hits WHERE site_id = ? AND day >= CAST(? AS DATE) AND day < CAST(? AS DATE) AND path <> ?
			GROUP BY path, name, kind HAVING sum(coalesce(blocked, 0)) + sum(errors) > 0
		) WHERE r <= ? ORDER BY name, kind, n DESC, path`, p.Site, from, to, crawlOther, crawlFailing)
	if err != nil {
		return nil, err
	}
	defer fails.Close()
	for fails.Next() {
		var f CrawlerFail
		if err := fails.Scan(&f.Path, &f.Name, &f.Kind, &f.Count, &f.Why); err != nil {
			return nil, err
		}
		out.Failing = append(out.Failing, f)
	}
	return out, fails.Err()
}

// crawlOther is the row the writer folds pages into past fair use.
const crawlOther = "(other)"

func sortRowsDesc(s []CrawlerSeries) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j].Total > s[j-1].Total; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
}
