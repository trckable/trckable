// Package importer brings history in from somewhere else.
//
// It reads events, not summaries: one line per pageview or goal, with a
// timestamp and a path. Anything a tool can export — Plausible's raw exports,
// an Umami database dump, a GA4 BigQuery query, a CSV somebody wrote by hand —
// can be shaped into this, and what arrives behaves exactly like traffic
// trckable recorded itself: sessions, sources, entry pages and goals are all
// worked out here, not trusted from the file.
package importer

import (
	"bufio"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/event"
)

// Row is one line of an import file. Only ts and path are required.
type Row struct {
	TS       string `json:"ts"`       // RFC3339, or unix seconds/milliseconds
	Path     string `json:"path"`     // "/pricing"
	Visitor  string `json:"visitor"`  // any stable id; hashed, never stored raw
	Referrer string `json:"referrer"` // "google.com" or a full URL
	Channel  string `json:"channel"`  // left empty, trckable works it out
	Country  string `json:"country"`  // "DE"
	Region   string `json:"region"`
	City     string `json:"city"`
	Device   string `json:"device"`  // Desktop | Mobile | Tablet
	Browser  string `json:"browser"` // "Chrome"
	OS       string `json:"os"`
	Goal     string `json:"goal"`     // a goal instead of a pageview
	Campaign string `json:"campaign"` // utm_campaign
	Source   string `json:"source"`   // utm_source
	Medium   string `json:"medium"`   // utm_medium

	housekeeping bool // a GA4 event about GA4 itself, left out
}

// Appender is the write-ahead log an import feeds. The importer never writes
// to DuckDB itself: history goes through the same path as live traffic, so
// exactly-once, sessionizing and rollups behave identically.
type Appender interface {
	Append(ctx context.Context, b []byte) (uint64, error)
}

// Pipeliner is an Appender that can take a batch before any of it is durable.
// A file of a million rows appended one at a time gets one fsync per row and
// takes minutes; enqueued in batches it takes seconds, in the same order, and
// still nothing is reported as imported until it is on disk.
type Pipeliner interface {
	Enqueue(ctx context.Context, b []byte) (func() (uint64, error), error)
}

// batchSize is how many records go into one group commit.
const batchSize = 2048

// Result is what an import did.
type Result struct {
	Rows    int
	Skipped int
	Ignored int // GA4's own housekeeping events (session_start, scroll…)
	First   time.Time
	Last    time.Time
}

// Progress is called every ProgressEvery rows, so importing a million of them
// is never a silent wait. Leave it nil and nothing is reported.
type Progress func(done, total int)

// ProgressEvery is how often Progress hears about it.
const ProgressEvery = 50_000

// Run reads rows from r and appends them as events for site.
func Run(ctx context.Context, log Appender, site string, r io.Reader, format string) (Result, error) {
	return RunWith(ctx, log, site, r, format, nil)
}

// RunWith is Run, saying how far it has got.
func RunWith(ctx context.Context, log Appender, site string, r io.Reader, format string, onProgress Progress) (Result, error) {
	var res Result
	rows, err := read(r, format)
	if err != nil {
		return res, err
	}
	if onProgress != nil && len(rows) > ProgressEvery {
		onProgress(0, len(rows))
	}
	pipe, _ := log.(Pipeliner)
	var waiting []func() (uint64, error)
	// Nothing counts as imported until its fsync has returned.
	settle := func() error {
		for _, wait := range waiting {
			if _, err := wait(); err != nil {
				return err
			}
			res.Rows++
		}
		waiting = waiting[:0]
		return nil
	}

	for i, row := range rows {
		if onProgress != nil && i > 0 && i%ProgressEvery == 0 {
			onProgress(i, len(rows))
		}
		if row.housekeeping {
			res.Ignored++
			continue
		}
		e, ok := toEvent(site, row, i)
		if !ok {
			res.Skipped++
			continue
		}
		b, err := e.Marshal()
		if err != nil {
			res.Skipped++
			continue
		}
		at := time.UnixMilli(e.TS)
		if res.First.IsZero() || at.Before(res.First) {
			res.First = at
		}
		if at.After(res.Last) {
			res.Last = at
		}
		if pipe == nil {
			if _, err := log.Append(ctx, b); err != nil {
				return res, err
			}
			res.Rows++
			continue
		}
		wait, err := pipe.Enqueue(ctx, b)
		if err != nil {
			return res, err
		}
		waiting = append(waiting, wait)
		if len(waiting) >= batchSize {
			if err := settle(); err != nil {
				return res, err
			}
		}
	}
	return res, settle()
}

// aliases are the names other tools give the same thing. An export from
// Plausible or Umami should import as it comes out, not after an afternoon of
// renaming columns. First match wins, and trckable's own name always does.
var aliases = map[string][]string{
	"ts":       {"timestamp", "created_at", "time", "datetime", "date", "event_timestamp"},
	"path":     {"url", "url_path", "pathname", "page", "page_path", "page_location"},
	"visitor":  {"visitor_id", "session_id", "user_id", "distinct_id", "client_id", "user_pseudo_id"},
	"referrer": {"referrer_domain", "referrer_source", "referer", "referring_domain", "page_referrer"},
	"goal":     {"event_name", "name", "event", "event_type"},
	"country":  {"country_code"},
	"region":   {"subdivision1", "state"},
	"device":   {"device_type", "screen_size"},
	"browser":  {"browser_name"},
	"os":       {"os_name", "operating_system"},
	"campaign": {"utm_campaign"},
	"source":   {"utm_source"},
	"medium":   {"utm_medium"},
	"channel":  {},
	"city":     {},
}

// pick returns the first field present, by trckable's name and then by every
// name another tool uses for it.
func pick(get func(string) string, name string) string {
	if v := get(name); v != "" {
		return v
	}
	for _, alt := range aliases[name] {
		if v := get(alt); v != "" {
			return v
		}
	}
	return ""
}

func rowFrom(get func(string) string) Row {
	r := Row{
		TS: pick(get, "ts"), Path: pick(get, "path"), Visitor: pick(get, "visitor"),
		Referrer: pick(get, "referrer"), Channel: pick(get, "channel"),
		Country: pick(get, "country"), Region: pick(get, "region"), City: pick(get, "city"),
		Device: pick(get, "device"), Browser: pick(get, "browser"), OS: pick(get, "os"),
		Goal: pick(get, "goal"), Campaign: pick(get, "campaign"), Source: pick(get, "source"), Medium: pick(get, "medium"),
	}
	// Umami and Plausible name every row, pageviews included: a row called
	// "pageview" is a pageview, not a goal called pageview.
	if g := strings.ToLower(r.Goal); g == "pageview" || g == "page_view" || g == "$pageview" {
		r.Goal = ""
	}
	return r
}

// read parses NDJSON or CSV into rows. CSV needs a header; the column names
// are the JSON field names above (or the name another tool uses), in any order.
func read(r io.Reader, format string) ([]Row, error) {
	br := bufio.NewReader(r)
	if format == "" {
		// Sniff: a JSON object starts with '{', a CSV starts with a header.
		if b, err := br.Peek(1); err == nil && b[0] == '{' {
			format = "ndjson"
		} else {
			format = "csv"
		}
	}
	if format == "ndjson" {
		var out []Row
		dec := json.NewDecoder(br)
		for {
			var raw map[string]any
			if err := dec.Decode(&raw); err == io.EOF {
				return out, nil
			} else if err != nil {
				return out, fmt.Errorf("line %d: %w", len(out)+1, err)
			}
			if isGA4(raw) {
				row, ok := ga4Row(raw)
				row.housekeeping = !ok
				out = append(out, row)
				continue
			}
			out = append(out, rowFrom(func(k string) string { return jsonField(raw, k) }))
		}
	}

	c := csv.NewReader(br)
	c.FieldsPerRecord = -1
	head, err := c.Read()
	if err != nil {
		return nil, fmt.Errorf("the file has no header row")
	}
	index := map[string]int{}
	for i, h := range head {
		index[strings.ToLower(strings.TrimSpace(h))] = i
	}
	get := func(rec []string, name string) string {
		if i, ok := index[name]; ok && i < len(rec) {
			return strings.TrimSpace(rec[i])
		}
		return ""
	}
	var out []Row
	for {
		rec, err := c.Read()
		if err == io.EOF {
			return out, nil
		}
		if err != nil {
			return out, err
		}
		out = append(out, rowFrom(func(k string) string { return get(rec, k) }))
	}
}

// jsonField reads one value from a decoded row, whatever shape it came in:
// a timestamp may be a string or a number, an id may be either.
func jsonField(raw map[string]any, key string) string {
	v, ok := raw[key]
	if !ok {
		return ""
	}
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case float64:
		if t == math.Trunc(t) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(t)
	}
	return ""
}

// toEvent turns one row into an event. A row without a usable timestamp or
// path is skipped rather than guessed at.
func toEvent(site string, r Row, i int) (event.Event, bool) {
	ts, ok := parseTime(r.TS)
	if !ok {
		return event.Event{}, false
	}
	path := r.Path
	if path == "" && r.Goal == "" {
		return event.Event{}, false
	}
	if path != "" && !strings.HasPrefix(path, "/") {
		// A full URL is fine too: keep the path.
		if i := strings.Index(path, "://"); i >= 0 {
			if slash := strings.Index(path[i+3:], "/"); slash >= 0 {
				path = path[i+3+slash:]
			} else {
				path = "/"
			}
		} else {
			path = "/" + path
		}
	}
	// Paths only: a query string is where emails and tokens end up.
	if i := strings.IndexAny(path, "?#"); i >= 0 {
		path = path[:i]
		if path == "" {
			path = "/"
		}
	}
	e := event.Event{
		Site:        site,
		Kind:        event.KindPageview,
		TS:          ts.UnixMilli(),
		Path:        path,
		RefHost:     refHost(r.Referrer),
		Channel:     r.Channel,
		Country:     countryCode(r.Country),
		Region:      r.Region,
		City:        r.City,
		Device:      r.Device,
		Browser:     r.Browser,
		OS:          r.OS,
		UTMCampaign: r.Campaign,
		UTMSource:   r.Source,
		UTMMedium:   r.Medium,
	}
	e.Imported = true
	if r.Goal != "" {
		e.Kind, e.Goal = event.KindGoal, r.Goal
	}
	// Visitors are hashed, so an imported id never lands in the database as
	// itself; rows with no id get one per row, which counts them as separate
	// visitors rather than pretending to know better.
	e.Visitor = hash64(site + "|" + r.Visitor + "|" + strconv.Itoa(boolIndex(r.Visitor == "", i)))
	e.Pageview = hash64(site + "|pv|" + strconv.Itoa(i) + "|" + r.TS)
	e.EventID = hash64(site + "|" + r.TS + "|" + path + "|" + r.Visitor + "|" + r.Goal + "|" + strconv.Itoa(i))
	if e.Channel == "" {
		e.Channel = channelFor(e.RefHost, r.Medium)
	}
	return e, true
}

func boolIndex(unique bool, i int) int {
	if unique {
		return i
	}
	return 0
}

// parseTime accepts RFC3339, a date, or unix seconds, milliseconds or
// microseconds (GA4's).
func parseTime(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02 15:04:05", "2006-01-02"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC(), true
		}
	}
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		if n > 1e14 {
			return time.UnixMicro(n).UTC(), true
		}
		if n > 1e12 {
			return time.UnixMilli(n).UTC(), true
		}
		if n > 1e9 {
			return time.Unix(n, 0).UTC(), true
		}
	}
	return time.Time{}, false
}

// refHost keeps the host of a referrer, which is all trckable stores.
func refHost(ref string) string {
	ref = strings.TrimSpace(strings.ToLower(ref))
	if ref == "" || ref == "direct" || ref == "(direct)" || ref == "none" {
		return ""
	}
	if i := strings.Index(ref, "://"); i >= 0 {
		ref = ref[i+3:]
	}
	if i := strings.IndexAny(ref, "/?#"); i >= 0 {
		ref = ref[:i]
	}
	return strings.TrimPrefix(ref, "www.")
}

// channelFor is a small version of the live classifier, for rows that do not
// name a channel.
func channelFor(ref, medium string) string {
	switch {
	case medium == "cpc" || medium == "ppc" || medium == "paid":
		return "Paid"
	case medium == "email" || strings.Contains(ref, "mail."):
		return "Email"
	case ref == "":
		return "Direct"
	case strings.Contains(ref, "google.") || strings.Contains(ref, "bing.") || strings.Contains(ref, "duckduckgo") || strings.Contains(ref, "ecosia") || strings.Contains(ref, "yahoo"):
		return "Search"
	case strings.Contains(ref, "chatgpt") || strings.Contains(ref, "claude") || strings.Contains(ref, "perplexity") || strings.Contains(ref, "copilot") || strings.Contains(ref, "gemini"):
		return "AI"
	case strings.Contains(ref, "x.com") || strings.Contains(ref, "twitter") || strings.Contains(ref, "facebook") || strings.Contains(ref, "linkedin") || strings.Contains(ref, "reddit") || strings.Contains(ref, "instagram") || strings.Contains(ref, "youtube") || strings.Contains(ref, "tiktok"):
		return "Social"
	default:
		return "Referral"
	}
}

// hash64 is FNV-1a: stable, fast, and not reversible into whatever the source
// tool used as an id.
func hash64(s string) uint64 {
	var h uint64 = 14695981039346656037
	for i := 0; i < len(s); i++ {
		h ^= uint64(s[i])
		h *= 1099511628211
	}
	return h
}
