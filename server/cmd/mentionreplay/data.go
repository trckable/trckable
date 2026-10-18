package main

import (
	"context"
	"database/sql"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	duckdb "github.com/duckdb/duckdb-go/v2"
	_ "modernc.org/sqlite"

	"github.com/trckable/trckable/server/internal/mentions"
)

// A data directory (or a copy of one) is read the way the live path reads it:
// the sites, the owners' words and rules and the stored feed items come from
// trckable.db, the visits from trckable.duckdb. Both are opened read-only.
const (
	sqliteFile = "trckable.db"
	duckFile   = "trckable.duckdb"
)

// dataOptions are the flags of a run over a data directory.
type dataOptions struct {
	Dir   string
	Days  int
	Until time.Time // the end of the window
	All   bool      // refused items too
	CSV   string
	MD    string
}

// row is one line of the report: an item, the matcher's answer and the visits around it.
type row struct {
	Site       string
	Day        string
	Source     string
	Title      string
	URL        string
	Verdict    string // hit | repeat | refused
	Rule       string // how it matched, or why it did not
	Matched    string // the word or site that decided it
	Pageviews  int64  // the site's pageviews from the day before to the day after
	Referred   int64  // visitors whose visit began from the item's host in that time
	HaveVisits bool
}

func openReadOnly(dir string) (*sql.DB, *sql.DB, error) {
	path := filepath.Join(dir, sqliteFile)
	if _, err := os.Stat(path); err != nil {
		return nil, nil, fmt.Errorf("no %s in %s", sqliteFile, dir)
	}
	// With no write-ahead log beside it the file is complete, and it is opened
	// immutable: nothing is locked or created next to it. With one, the log
	// holds recent writes, so the file is opened read-only to see them.
	mode := "mode=ro"
	if _, err := os.Stat(path + "-wal"); err != nil {
		mode = "mode=ro&immutable=1"
	}
	lite, err := sql.Open("sqlite", "file:"+path+"?"+mode+"&_pragma=query_only(1)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, nil, err
	}
	if err := lite.PingContext(context.Background()); err != nil {
		lite.Close()
		return nil, nil, err
	}
	dpath := filepath.Join(dir, duckFile)
	if _, err := os.Stat(dpath); err != nil {
		return lite, nil, nil // no traffic file: the visit columns stay empty
	}
	conn, err := duckdb.NewConnector(dpath+"?access_mode=read_only", nil)
	if err != nil {
		lite.Close()
		return nil, nil, err
	}
	duck := sql.OpenDB(conn)
	if err := duck.PingContext(context.Background()); err != nil {
		lite.Close()
		duck.Close()
		return nil, nil, err
	}
	return lite, duck, nil
}

func loadInput(ctx context.Context, db *sql.DB, from, until time.Time) (mentions.ReplayInput, map[string]string, error) {
	var in mentions.ReplayInput
	domains := map[string]string{}
	sites := map[string]*mentions.ReplaySite{}
	rows, err := db.QueryContext(ctx, `SELECT id, domain FROM sites ORDER BY domain`)
	if err != nil {
		return in, nil, err
	}
	for rows.Next() {
		var s mentions.ReplaySite
		if err := rows.Scan(&s.ID, &s.Domain); err != nil {
			rows.Close()
			return in, nil, err
		}
		in.Sites = append(in.Sites, s)
		domains[s.ID] = s.Domain
	}
	rows.Close()
	for i := range in.Sites {
		sites[in.Sites[i].ID] = &in.Sites[i]
	}
	words, err := db.QueryContext(ctx, `SELECT site_id, keyword FROM mention_keywords ORDER BY site_id, created_at, keyword`)
	if err != nil {
		return in, nil, err
	}
	for words.Next() {
		var id, k string
		if err := words.Scan(&id, &k); err != nil {
			words.Close()
			return in, nil, err
		}
		if s := sites[id]; s != nil {
			s.Names = append(s.Names, k)
		}
	}
	words.Close()
	rules, err := db.QueryContext(ctx, `SELECT site_id, kind, value FROM mention_rules ORDER BY site_id, kind, value`)
	if err != nil {
		return in, nil, err
	}
	for rules.Next() {
		var id, kind, v string
		if err := rules.Scan(&id, &kind, &v); err != nil {
			rules.Close()
			return in, nil, err
		}
		s := sites[id]
		if s == nil {
			continue
		}
		switch kind {
		case "topic":
			s.Topic = append(s.Topic, v)
		case "required":
			s.Required = append(s.Required, v)
		case "excluded":
			s.Excluded = append(s.Excluded, v)
		case "blocked":
			s.Blocked = append(s.Blocked, v)
		}
	}
	rules.Close()
	items, err := db.QueryContext(ctx, `SELECT site_id, source, url, host, title, snippet, link, posted_at FROM mentions
		WHERE posted_at >= ? AND posted_at < ? ORDER BY posted_at, id`, from.Unix(), until.Unix())
	if err != nil {
		return in, nil, err
	}
	defer items.Close()
	for items.Next() {
		var it mentions.ReplayItem
		if err := items.Scan(&it.SiteID, &it.Source, &it.URL, &it.Host, &it.Title, &it.Snippet, &it.Link, &it.PostedAt); err != nil {
			return in, nil, err
		}
		in.Items = append(in.Items, it)
	}
	return in, domains, items.Err()
}

// visitsAround counts the site's pageviews and the visitors who came from host,
// from the start of the day before the item to the end of the day after it (UTC).
func visitsAround(ctx context.Context, duck *sql.DB, site, host string, posted int64) (pageviews, referred int64, err error) {
	day := time.Unix(posted, 0).UTC().Truncate(24 * time.Hour)
	from, to := day.AddDate(0, 0, -1), day.AddDate(0, 0, 2)
	if err = duck.QueryRowContext(ctx, `SELECT count(*) FROM events WHERE site_id = ? AND kind = 1 AND ts >= ? AND ts < ?`, site, from, to).Scan(&pageviews); err != nil {
		return 0, 0, err
	}
	host = strings.TrimPrefix(strings.ToLower(host), "www.")
	if host == "" {
		return pageviews, 0, nil
	}
	err = duck.QueryRowContext(ctx, `SELECT count(DISTINCT visitor_id) FROM sessions WHERE site_id = ? AND start >= ? AND start < ? AND referrer = ?`, site, from, to, host).Scan(&referred)
	return pageviews, referred, err
}

func buildRows(ctx context.Context, lite, duck *sql.DB, opt dataOptions) ([]row, error) {
	from := opt.Until.AddDate(0, 0, -opt.Days)
	in, domains, err := loadInput(ctx, lite, from, opt.Until)
	if err != nil {
		return nil, err
	}
	hosts := map[[2]string]string{}
	for _, it := range in.Items {
		hosts[[2]string{it.SiteID, it.URL}] = it.Host
	}
	var out []row
	for _, res := range mentions.Replay(in) {
		r := row{Site: domains[res.Site], Day: day(res.PostedAt), Source: res.Source, Title: clean(res.Title), URL: res.URL, Matched: res.Verdict.Word}
		switch {
		case res.Hit():
			r.Verdict, r.Rule = "hit", res.Verdict.Via
		case res.Dup:
			r.Verdict, r.Rule, r.Matched = "repeat", "same story as an earlier hit", ""
		default:
			r.Verdict, r.Rule = "refused", res.Verdict.Reason
		}
		if r.Site == "" {
			r.Site = res.Site
		}
		if r.Verdict != "hit" && !opt.All {
			continue
		}
		if duck != nil {
			pv, ref, err := visitsAround(ctx, duck, res.Site, hosts[[2]string{res.Site, res.URL}], res.PostedAt)
			if err != nil {
				return nil, err
			}
			r.Pageviews, r.Referred, r.HaveVisits = pv, ref, true
		}
		out = append(out, r)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Site < out[j].Site })
	return out, nil
}

func writeCSV(w io.Writer, rows []row) error {
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"site", "day", "source", "title", "url", "verdict", "rule", "matched", "pageviews_day-1_to_day+1", "referred_visitors_day-1_to_day+1"})
	for _, r := range rows {
		pv, ref := "", ""
		if r.HaveVisits {
			pv, ref = strconv.FormatInt(r.Pageviews, 10), strconv.FormatInt(r.Referred, 10)
		}
		_ = cw.Write([]string{r.Site, r.Day, r.Source, r.Title, r.URL, r.Verdict, r.Rule, r.Matched, pv, ref})
	}
	cw.Flush()
	return cw.Error()
}

func writeMarkdown(w io.Writer, rows []row, opt dataOptions) error {
	cell := func(s string) string { return strings.ReplaceAll(strings.ReplaceAll(s, "|", `\|`), "\n", " ") }
	fmt.Fprintf(w, "# Mentions replay\n\nThe last %d days up to %s, %d rows. Visits are the site's pageviews and the visitors who came from the item's host, from the day before to the day after it (UTC).\n\n", opt.Days, opt.Until.UTC().Format("2006-01-02"), len(rows))
	fmt.Fprintln(w, "| Site | Day | Source | Verdict | Rule | Matched | Title | Pageviews | From host |")
	fmt.Fprintln(w, "|---|---|---|---|---|---|---|---|---|")
	for _, r := range rows {
		pv, ref := "-", "-"
		if r.HaveVisits {
			pv, ref = strconv.FormatInt(r.Pageviews, 10), strconv.FormatInt(r.Referred, 10)
		}
		title := cell(r.Title)
		if r.URL != "" {
			title = "[" + title + "](" + strings.NewReplacer(" ", "%20", ")", "%29", "|", "%7C").Replace(r.URL) + ")"
		}
		fmt.Fprintf(w, "| %s | %s | %s | %s | %s | %s | %s | %s | %s |\n", cell(r.Site), r.Day, cell(r.Source), r.Verdict, cell(r.Rule), cell(r.Matched), title, pv, ref)
	}
	return nil
}

func create(path string) (*os.File, error) {
	if path == "" {
		return nil, nil
	}
	return os.Create(path) //nolint:gosec // the report named on the command line
}

// runData reads the data directory and writes the reports; it changes nothing in it.
func runData(ctx context.Context, opt dataOptions, errOut io.Writer) error {
	if opt.Days <= 0 {
		return errors.New("-days must be positive")
	}
	if opt.CSV == "" && opt.MD == "" {
		return errors.New("name a report: -csv file and/or -md file")
	}
	lite, duck, err := openReadOnly(opt.Dir)
	if err != nil {
		return err
	}
	defer lite.Close()
	if duck != nil {
		defer duck.Close()
	} else {
		fmt.Fprintf(errOut, "no %s in %s: the visit columns are left empty\n", duckFile, opt.Dir)
	}
	rows, err := buildRows(ctx, lite, duck, opt)
	if err != nil {
		return err
	}
	for _, f := range []struct {
		path  string
		write func(io.Writer) error
	}{
		{opt.CSV, func(w io.Writer) error { return writeCSV(w, rows) }},
		{opt.MD, func(w io.Writer) error { return writeMarkdown(w, rows, opt) }},
	} {
		out, err := create(f.path)
		if err != nil {
			return err
		}
		if out == nil {
			continue
		}
		err = f.write(out)
		if cerr := out.Close(); err == nil {
			err = cerr
		}
		if err != nil {
			return err
		}
	}
	hits := 0
	for _, r := range rows {
		if r.Verdict == "hit" {
			hits++
		}
	}
	fmt.Fprintf(errOut, "%d rows, %d hits\n", len(rows), hits)
	return nil
}
