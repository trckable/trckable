package query

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"
)

// What counts as "AI" among the crawlers: the ones that answer for someone
// and the ones that collect training data. Search bots are not AI's reading.
const (
	channelAI     = "AI"
	crawlAnswer   = "answer"
	crawlTrain    = "train"
	crawlIndex    = "index"
	aiMaxBots     = 50
	aiMaxReads    = 200
	aiMaxReferrer = 50
)

// The floors under the two flags, so one stray hit or click is not a finding.
const (
	// FlagMinReads is how often AI must have read a page, with no visitor
	// credited to it, before it is called uncredited.
	FlagMinReads = 10
	// FlagMinClicks is how many Google clicks a page needs before an AI that
	// never read it is worth saying.
	FlagMinClicks = 5
)

// Flags a page can carry.
const (
	FlagUncredited = "uncredited" // AI reads it, and sends nobody
	FlagUnread     = "unread"     // Google sends people, AI never reads it
)

// AISearch is the AI & Search tab, except Google's terms (their own request):
// the visitors AI assistants sent, the robots that read the site, and for
// each page how often it was read against how many people it was sent.
type AISearch struct {
	Visitors   int64         `json:"visitors"`   // the assistants' visitors added up: always the sum of Assistants
	Assistants []AIAssistant `json:"assistants"` // the AI channel by assistant, busiest first; only assistants we know
	Referrers  []Row         `json:"referrers"`  // the AI channel by referrer
	Crawled    int64         `json:"crawled"`    // hits by AI crawlers (answering and training)
	Bots       []AIBot       `json:"bots"`       // busiest first
	Pages      []AIPage      `json:"pages"`      // read, sent and flags, busiest first
}

// AIAssistant is one assistant's distinct visitors, and the referrer host that
// sent most of them (empty when none did: an app that sends no referrer).
type AIAssistant struct {
	Name     string `json:"name"`
	Visitors int64  `json:"visitors"`
	Referrer string `json:"referrer,omitempty"`
}

// aiNames maps a referrer host (itself or any subdomain) to the product people
// know it by. The same hosts the channel rules put in the AI channel.
var aiNames = [][2]string{
	{"chatgpt.com", "ChatGPT"}, {"chat.openai.com", "ChatGPT"}, {"openai.com", "ChatGPT"},
	{"perplexity.ai", "Perplexity"}, {"claude.ai", "Claude"},
	{"gemini.google.com", "Gemini"}, {"bard.google.com", "Gemini"},
	{"copilot.microsoft.com", "Copilot"}, {"bing.com", "Copilot"},
	{"deepseek.com", "DeepSeek"}, {"grok.com", "Grok"}, {"meta.ai", "Meta AI"}, {"mistral.ai", "Mistral"},
	{"you.com", "You.com"}, {"phind.com", "Phind"}, {"poe.com", "Poe"}, {"kagi.com", "Kagi"},
}

// aiSources maps a utm_source (lower case) to its assistant: an app that sends
// no referrer tags its links instead (?utm_source=chatgpt.com).
var aiSources = [][2]string{
	{"chatgpt", "ChatGPT"}, {"chatgpt.com", "ChatGPT"}, {"openai", "ChatGPT"}, {"perplexity", "Perplexity"},
	{"claude", "Claude"}, {"gemini", "Gemini"}, {"copilot", "Copilot"}, {"deepseek", "DeepSeek"}, {"grok", "Grok"},
}

// aiAssistantSQL names the assistant of a session in the AI channel: by the
// referrer's host first, then by utm_source; null when neither is one we know.
// It is built only from the constants above.
var aiAssistantSQL = func() string {
	var b strings.Builder
	b.WriteString("CASE")
	host := `regexp_replace(lower(coalesce(referrer, '')), '^www\.', '')`
	for _, n := range aiNames {
		b.WriteString(" WHEN " + host + " = '" + n[0] + "' OR " + host + " LIKE '%." + n[0] + "' THEN '" + n[1] + "'")
	}
	for _, n := range aiSources {
		b.WriteString(" WHEN lower(coalesce(utm_source, '')) = '" + n[0] + "' THEN '" + n[1] + "'")
	}
	b.WriteString(" END")
	return b.String()
}()

// AIBot is one crawler on one errand.
type AIBot struct {
	Name    string `json:"name"`
	Kind    string `json:"kind"`
	Hits    int64  `json:"hits"`
	Blocked int64  `json:"blocked,omitempty"` // turned away: 401, 403, 429
	Errors  int64  `json:"errors,omitempty"`  // broken pages: 404, 5xx and the rest
}

// AIPage is one page's two numbers: how often AI read it, and how many
// visitors AI sent to it as their first page.
type AIPage struct {
	Path   string  `json:"path"`
	Read   int64   `json:"read"`
	Sent   int64   `json:"sent"`
	Bots   []AIBot `json:"bots,omitempty"`   // who read it, most first (at most three)
	Clicks float64 `json:"clicks,omitempty"` // Google's clicks for it, when Search Console says
	Flag   string  `json:"flag,omitempty"`
}

// AIOptions are what the query cannot know on its own.
type AIOptions struct {
	// Clicks are Google's clicks per page path, when Search Console is
	// connected; nil otherwise. A page only Google knows is added to the list.
	Clicks map[string]float64
	// Page narrows what the robots read to one path: the dashboard's page
	// filter, which sessions already obey.
	Page string
}

// AISearch reads the tab in one pass over the sessions and one over the crawler
// counters. The ratio is a single join of the two, however many pages the site
// has: nothing asks a page at a time.
func (q Q) AISearch(ctx context.Context, p Params, o AIOptions) (*AISearch, error) {
	tz, err := safeTZ(p.TZ)
	if err != nil {
		return nil, err
	}
	loc, _ := time.LoadLocation(tz)
	conn, err := q.conn(ctx, p.Site)
	if err != nil {
		return nil, err
	}
	defer q.done(conn)
	cte, args, err := sessionsCTE(p)
	if err != nil {
		return nil, err
	}
	// Counters are kept per day in the site's own zone.
	from := p.From.In(loc).Format(time.DateOnly)
	to := p.To.In(loc).Add(-time.Nanosecond).AddDate(0, 0, 1).Format(time.DateOnly)
	out := &AISearch{Assistants: []AIAssistant{}, Referrers: []Row{}, Bots: []AIBot{}, Pages: []AIPage{}}

	// Who AI sent, by assistant: only the ones we can name, so the header is
	// the sum of the rows and a referrer that is no assistant never appears.
	//nolint:gosec // aiAssistantSQL is built from constants in this file; every value is bound
	rows, err := conn.QueryContext(ctx, cte+`
		SELECT GROUPING(r) AS g, a, coalesce(r, ''), count(DISTINCT visitor_id)
		FROM (SELECT `+aiAssistantSQL+` AS a, referrer AS r, visitor_id FROM s WHERE channel = ?)
		WHERE a IS NOT NULL
		GROUP BY GROUPING SETS ((a, r), (a))
		ORDER BY 4 DESC, 3`, append(append([]any{}, args...), channelAI)...) // ties: the referrer that sorts first, not whichever the scan met first
	if err != nil {
		return nil, fmt.Errorf("ai assistants: %w", err)
	}
	defer rows.Close()
	named := map[string]*AIAssistant{}
	top := map[string]int64{}
	for rows.Next() {
		var g, n int64
		var name, ref string
		if err := rows.Scan(&g, &name, &ref, &n); err != nil {
			return nil, err
		}
		a := named[name]
		if a == nil {
			a = &AIAssistant{Name: name}
			named[name] = a
		}
		if g == 1 {
			a.Visitors = n
		} else if ref != "" && n > top[name] {
			a.Referrer, top[name] = ref, n
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, a := range named {
		out.Assistants = append(out.Assistants, *a)
		out.Visitors += a.Visitors
	}
	sort.Slice(out.Assistants, func(i, j int) bool {
		a, b := out.Assistants[i], out.Assistants[j]
		if a.Visitors != b.Visitors {
			return a.Visitors > b.Visitors
		}
		return a.Name < b.Name
	})

	// And by referrer, for the ones who want the hosts.
	refs, err := conn.QueryContext(ctx, cte+`
		SELECT coalesce(r, ''), count(DISTINCT visitor_id)
		FROM (SELECT referrer AS r, visitor_id FROM s WHERE channel = ?)
		GROUP BY r ORDER BY 2 DESC, 1 LIMIT ?`, append(append([]any{}, args...), channelAI, aiMaxReferrer)...)
	if err != nil {
		return nil, fmt.Errorf("ai referrers: %w", err)
	}
	defer refs.Close()
	for refs.Next() {
		var ref string
		var n int64
		if err := refs.Scan(&ref, &n); err != nil {
			return nil, err
		}
		out.Referrers = append(out.Referrers, Row{Value: ref, Visitors: n})
	}
	if err := refs.Err(); err != nil {
		return nil, err
	}

	// What the robots did, by crawler: the AI ones, and in the list of robots also the search engines' indexers, whose
	// failures matter as much. Which page AI read stays AI only.
	span := []any{p.Site, from, to}
	scope := `site_id = ? AND day >= CAST(? AS DATE) AND day < CAST(? AS DATE) AND kind IN ('` + crawlAnswer + `', '` + crawlTrain + `')`
	robots := `site_id = ? AND day >= CAST(? AS DATE) AND day < CAST(? AS DATE) AND kind IN ('` + crawlAnswer + `', '` + crawlTrain + `', '` + crawlIndex + `')`
	//nolint:gosec // scope and pathIf are constant fragments of this file; every value is bound
	bots, err := conn.QueryContext(ctx, `
		SELECT name, kind, sum(hits)::BIGINT AS n, sum(coalesce(blocked, 0))::BIGINT, sum(errors)::BIGINT
		FROM crawler_hits WHERE `+robots+pathIf(o.Page)+`
		GROUP BY 1, 2 ORDER BY n DESC, 1, 2 LIMIT ?`, append(withPage(span, o.Page), aiMaxBots)...)
	if err != nil {
		return nil, fmt.Errorf("ai crawlers: %w", err)
	}
	defer bots.Close()
	for bots.Next() {
		var b AIBot
		if err := bots.Scan(&b.Name, &b.Kind, &b.Hits, &b.Blocked, &b.Errors); err != nil {
			return nil, err
		}
		out.Bots = append(out.Bots, b)
		if b.Kind != crawlIndex {
			out.Crawled += b.Hits
		}
	}
	if err := bots.Err(); err != nil {
		return nil, err
	}

	// Which robot read which page.
	//nolint:gosec // scope and pathIf are constant fragments of this file; every value is bound
	reads, err := conn.QueryContext(ctx, `
		SELECT path, name, kind, sum(hits)::BIGINT AS n FROM crawler_hits WHERE `+scope+` AND path <> ?`+pathIf(o.Page)+`
		GROUP BY 1, 2, 3 ORDER BY n DESC, 1, 2 LIMIT ?`, append(withPage(append(span, crawlOther), o.Page), aiMaxReads)...)
	if err != nil {
		return nil, fmt.Errorf("ai reads: %w", err)
	}
	defer reads.Close()
	by := map[string][]AIBot{}
	for reads.Next() {
		var path string
		var b AIBot
		if err := reads.Scan(&path, &b.Name, &b.Kind, &b.Hits); err != nil {
			return nil, err
		}
		by[path] = append(by[path], b)
	}
	if err := reads.Err(); err != nil {
		return nil, err
	}

	// The ratio: pages read and pages sent to, side by side, in one join.
	ratio, err := conn.QueryContext(ctx, cte+`,
		sent AS (SELECT entry_page AS path, count(DISTINCT visitor_id) AS n FROM s
			WHERE channel = ? AND entry_page IS NOT NULL GROUP BY 1),
		read AS (SELECT path, sum(hits)::BIGINT AS n FROM crawler_hits
			WHERE `+scope+` AND path <> ?`+pathIf(o.Page)+` GROUP BY 1)
		SELECT coalesce(read.path, sent.path), coalesce(read.n, 0)::BIGINT, coalesce(sent.n, 0)::BIGINT
		FROM read FULL OUTER JOIN sent ON read.path = sent.path
		ORDER BY 2 + 3 DESC, 1 LIMIT ?`,
		append(append(append(append([]any{}, args...), channelAI), withPage(append(span, crawlOther), o.Page)...), 200)...)
	if err != nil {
		return nil, fmt.Errorf("ai ratio: %w", err)
	}
	defer ratio.Close()
	seen := map[string]bool{}
	for ratio.Next() {
		var pg AIPage
		if err := ratio.Scan(&pg.Path, &pg.Read, &pg.Sent); err != nil {
			return nil, err
		}
		seen[pg.Path] = true
		out.Pages = append(out.Pages, pg)
	}
	if err := ratio.Err(); err != nil {
		return nil, err
	}
	for path := range o.Clicks {
		if !seen[path] {
			out.Pages = append(out.Pages, AIPage{Path: path})
		}
	}
	for i := range out.Pages {
		pg := &out.Pages[i]
		pg.Clicks = o.Clicks[pg.Path]
		pg.Bots = by[pg.Path]
		if len(pg.Bots) > 3 {
			pg.Bots = pg.Bots[:3]
		}
		// "Unread" only means something when robots are being reported at all.
		pg.Flag = PageFlag(pg.Read, pg.Sent, pg.Clicks, out.Crawled > 0)
	}
	sort.SliceStable(out.Pages, func(i, j int) bool {
		a, b := out.Pages[i], out.Pages[j]
		if wa, wb := a.weight(), b.weight(); wa != wb {
			return wa > wb
		}
		return a.Path < b.Path
	})
	if n := max(p.Limit, 10); len(out.Pages) > n {
		out.Pages = out.Pages[:n]
	}
	return out, nil
}

// weight orders the list: every kind of attention a page got.
func (a AIPage) weight() int64 { return a.Read + a.Sent + int64(a.Clicks) }

// PageFlag says which of the two things worth knowing a page shows, if either.
// robots says whether any robot was reported at all: without that, every page
// would look unread.
func PageFlag(read, sent int64, clicks float64, robots bool) string {
	switch {
	case read >= FlagMinReads && sent == 0:
		return FlagUncredited
	case robots && read == 0 && clicks >= FlagMinClicks:
		return FlagUnread
	}
	return ""
}

func pathIf(page string) string {
	if page == "" {
		return ""
	}
	return " AND path = ?"
}

func withPage(args []any, page string) []any {
	out := append([]any{}, args...)
	if page != "" {
		out = append(out, page)
	}
	return out
}

// AISeen says whether the site has ever had an AI assistant send a visitor,
// and whether an AI crawler has ever read it: the two moments a guide may
// speak about. Two indexed lookups, no period.
func (q Q) AISeen(ctx context.Context, site string) (visitor, crawler bool, err error) {
	conn, err := q.conn(ctx, site)
	if err != nil {
		return false, false, err
	}
	defer q.done(conn)
	err = conn.QueryRowContext(ctx, `
		SELECT
			EXISTS (SELECT 1 FROM sessions WHERE site_id = ? AND channel = ?)
			OR EXISTS (SELECT 1 FROM s_open WHERE site_id = ? AND channel = ?),
			EXISTS (SELECT 1 FROM crawler_hits WHERE site_id = ? AND kind IN (?, ?))`,
		site, channelAI, site, channelAI, site, crawlAnswer, crawlTrain).Scan(&visitor, &crawler)
	return visitor, crawler, err
}

// AIPagesFor is the two numbers of the AI & Search tab for exactly these pages:
// how often AI read each and how many visitors AI sent to it as their first
// page. Unlike AISearch it is not cut to the busiest pages, so a page an
// answer linked is found wherever it ranks. A path nobody read or was sent to
// is in the answer with zeros.
func (q Q) AIPagesFor(ctx context.Context, p Params, paths []string) ([]AIPage, error) {
	out := make([]AIPage, 0, len(paths))
	if len(paths) == 0 {
		return out, nil
	}
	tz, err := safeTZ(p.TZ)
	if err != nil {
		return nil, err
	}
	loc, _ := time.LoadLocation(tz)
	conn, err := q.conn(ctx, p.Site)
	if err != nil {
		return nil, err
	}
	defer q.done(conn)
	cte, args, err := sessionsCTE(p)
	if err != nil {
		return nil, err
	}
	from := p.From.In(loc).Format(time.DateOnly)
	to := p.To.In(loc).Add(-time.Nanosecond).AddDate(0, 0, 1).Format(time.DateOnly)
	in := strings.TrimSuffix(strings.Repeat("?,", len(paths)), ",")
	scope := `site_id = ? AND day >= CAST(? AS DATE) AND day < CAST(? AS DATE) AND kind IN ('` + crawlAnswer + `', '` + crawlTrain + `')`
	all := append(append([]any{}, args...), channelAI)
	for _, pa := range paths {
		all = append(all, pa)
	}
	all = append(all, p.Site, from, to)
	for _, pa := range paths {
		all = append(all, pa)
	}
	//nolint:gosec // in is a run of placeholders and scope a constant; every value is bound
	rows, err := conn.QueryContext(ctx, cte+`,
		sent AS (SELECT entry_page AS path, count(DISTINCT visitor_id) AS n FROM s
			WHERE channel = ? AND entry_page IN (`+in+`) GROUP BY 1),
		read AS (SELECT path, sum(hits)::BIGINT AS n FROM crawler_hits
			WHERE `+scope+` AND path IN (`+in+`) GROUP BY 1)
		SELECT coalesce(read.path, sent.path), coalesce(read.n, 0)::BIGINT, coalesce(sent.n, 0)::BIGINT
		FROM read FULL OUTER JOIN sent ON read.path = sent.path`, all...)
	if err != nil {
		return nil, fmt.Errorf("ai pages: %w", err)
	}
	defer rows.Close()
	found := map[string]AIPage{}
	for rows.Next() {
		var pg AIPage
		if err := rows.Scan(&pg.Path, &pg.Read, &pg.Sent); err != nil {
			return nil, err
		}
		found[pg.Path] = pg
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, pa := range paths {
		pg, ok := found[pa]
		if !ok {
			pg = AIPage{Path: pa}
		}
		out = append(out, pg)
	}
	return out, nil
}
