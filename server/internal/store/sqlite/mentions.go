package sqlite

import (
	"context"
	"errors"
	"sort"
	"strings"
	"unicode/utf8"
)

// MaxKeywords is how many extra search words a site may add; its address and
// name are always searched on top of them.
const MaxKeywords = 10

// ErrKeywords is a list of words that cannot be kept; the message says why.
var ErrKeywords = errors.New("keywords")

// Mention is one place a site was talked about, with the visitors it brought.
type Mention struct {
	ID       int64  `json:"id"`
	Site     string `json:"-"`
	Source   string `json:"source"` // hn | ph | news
	URL      string `json:"url"`
	Kind     string `json:"kind,omitempty"` // "comment" for a Hacker News comment; empty for a story, a launch, an article
	Title    string `json:"title"`
	Author   string `json:"author,omitempty"`
	Host     string `json:"host"`                // whose visits it can bring
	Points   int    `json:"points,omitempty"`    // Hacker News points, Product Hunt upvotes
	Comments int    `json:"comments,omitempty"`  // Hacker News comments on a story
	Snippet  string `json:"snippet,omitempty"`   // the sentence that named a keyword
	Front    bool   `json:"front,omitempty"`     // on the Hacker News front page
	PostedAt int64  `json:"posted_at"`           // unix seconds
	FoundAt  int64  `json:"found_at"`            // unix seconds
	Visitors int64  `json:"visitors"`            // brought, from the posting until two days after
	PeakHour int64  `json:"peak_hour,omitempty"` // unix seconds of the busiest hour; 0 when none came
	ScoredAt int64  `json:"-"`
	Alerted  bool   `json:"-"`
}

// MentionKeywords are the words a person added to a site's search.
func (s *Store) MentionKeywords(ctx context.Context, site string) ([]string, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT keyword FROM mention_keywords WHERE site_id = ? ORDER BY created_at, keyword`, site)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

// CleanKeywords trims, drops empty and repeated words (in any case) and
// refuses too many or too long.
func CleanKeywords(in []string) ([]string, error) {
	seen := map[string]bool{}
	out := []string{}
	for _, k := range in {
		k = strings.Join(strings.Fields(k), " ")
		if k == "" || seen[strings.ToLower(k)] {
			continue
		}
		if utf8.RuneCountInString(k) < 3 || utf8.RuneCountInString(k) > 60 || strings.ContainsAny(k, `"<>`) {
			return nil, errors.Join(ErrKeywords, errors.New("each word is 3 to 60 characters, without quotes"))
		}
		seen[strings.ToLower(k)] = true
		out = append(out, k)
	}
	if len(out) > MaxKeywords {
		return nil, errors.Join(ErrKeywords, errors.New("at most 10 words"))
	}
	return out, nil
}

// SetMentionKeywords replaces a site's added words.
func (s *Store) SetMentionKeywords(ctx context.Context, site string, words []string, now int64) error {
	words, err := CleanKeywords(words)
	if err != nil {
		return err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `DELETE FROM mention_keywords WHERE site_id = ?`, site); err != nil {
		return err
	}
	for i, k := range words {
		if _, err := tx.ExecContext(ctx, `INSERT INTO mention_keywords (site_id, keyword, created_at) VALUES (?, ?, ?)`, site, k, now+int64(i)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// SearchWords are every word a site is searched for: its address, its name
// when that is a different word, then the ones added. In that order, no repeats.
func (s *Store) SearchWords(ctx context.Context, site SiteRow) ([]string, error) {
	added, err := s.MentionKeywords(ctx, site.ID)
	if err != nil {
		return nil, err
	}
	return JoinWords(site, added), nil
}

// JoinWords is SearchWords for words already read. A site's address is always
// searched; its name only when it is distinctive: it holds the address's own
// label ("Acme" for acme.example) or is two words or more. A lone ordinary word
// ("Notes", "Studio") would find everything but the site.
func JoinWords(site SiteRow, added []string) []string {
	out := []string{}
	seen := map[string]bool{}
	name := strings.TrimSpace(site.Name)
	label := strings.ToLower(strings.SplitN(strings.TrimPrefix(strings.ToLower(site.Domain), "www."), ".", 2)[0])
	if len(strings.Fields(name)) < 2 && !(len(label) >= 3 && strings.Contains(strings.ToLower(name), label)) {
		name = ""
	}
	for _, k := range append([]string{site.Domain, name}, added...) {
		k = strings.TrimSpace(k)
		if utf8.RuneCountInString(k) < 3 || seen[strings.ToLower(k)] {
			continue
		}
		seen[strings.ToLower(k)] = true
		out = append(out, k)
	}
	return out
}

// SaveMention keeps a mention the first time it is seen and, after that, only
// what can change (a title edited, points gained, reaching the front page).
// It says whether the mention is new.
func (s *Store) SaveMention(ctx context.Context, m Mention, now int64) (bool, error) {
	res, err := s.DB.ExecContext(ctx, `INSERT INTO mentions (site_id, source, url, kind, title, author, host, points, comments, snippet, front, posted_at, found_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (site_id, url) DO NOTHING`,
		m.Site, m.Source, m.URL, m.Kind, m.Title, m.Author, m.Host, m.Points, m.Comments, m.Snippet, boolInt(m.Front), m.PostedAt, now)
	if err != nil {
		return false, err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return true, nil
	}
	_, err = s.DB.ExecContext(ctx, `UPDATE mentions SET title = ?, points = max(points, ?), comments = max(comments, ?), snippet = CASE WHEN ? <> '' THEN ? ELSE snippet END, front = max(front, ?) WHERE site_id = ? AND url = ?`,
		m.Title, m.Points, m.Comments, m.Snippet, m.Snippet, boolInt(m.Front), m.Site, m.URL)
	return false, err
}

const mentionCols = `id, site_id, source, url, kind, title, author, host, points, comments, snippet, front, posted_at, found_at, visitors, peak_hour, scored_at, alerted`

func scanMentions(rows interface {
	Next() bool
	Scan(...any) error
	Err() error
}) ([]Mention, error) {
	out := []Mention{}
	for rows.Next() {
		var m Mention
		var front, alerted int
		if err := rows.Scan(&m.ID, &m.Site, &m.Source, &m.URL, &m.Kind, &m.Title, &m.Author, &m.Host, &m.Points, &m.Comments, &m.Snippet, &front, &m.PostedAt, &m.FoundAt, &m.Visitors, &m.PeakHour, &m.ScoredAt, &alerted); err != nil {
			return nil, err
		}
		m.Front, m.Alerted = front == 1, alerted == 1
		out = append(out, m)
	}
	return out, rows.Err()
}

// Mentions lists a site's mentions posted in [from, to), newest first, at most limit.
func (s *Store) Mentions(ctx context.Context, site string, from, to int64, limit int) ([]Mention, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT `+mentionCols+` FROM mentions WHERE site_id = ? AND posted_at >= ? AND posted_at < ?
		ORDER BY posted_at DESC, id DESC LIMIT ?`, site, from, to, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMentions(rows)
}

// MentionsToScore lists, for every site, the mentions whose traffic is still
// being counted: not scored yet, or posted after `since`.
func (s *Store) MentionsToScore(ctx context.Context, since int64) ([]Mention, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT `+mentionCols+` FROM mentions WHERE scored_at = 0 OR posted_at >= ? ORDER BY site_id, posted_at`, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMentions(rows)
}

// MentionsOfHost lists a site's mentions that can bring visitors through one host.
func (s *Store) MentionsOfHost(ctx context.Context, site, host string, from int64) ([]Mention, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT `+mentionCols+` FROM mentions WHERE site_id = ? AND host = ? AND posted_at >= ? ORDER BY posted_at, id`, site, host, from)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMentions(rows)
}

// SaveScore records the visitors a mention brought and when most came.
func (s *Store) SaveScore(ctx context.Context, id, visitors, peak, at int64) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE mentions SET visitors = ?, peak_hour = ?, scored_at = ? WHERE id = ?`, visitors, peak, at, id)
	return err
}

// MarkMentionAlerted records that a mention has been told about.
func (s *Store) MarkMentionAlerted(ctx context.Context, id int64) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE mentions SET alerted = 1 WHERE id = ?`, id)
	return err
}

// PruneMentions removes a site's mentions posted before the given moment.
func (s *Store) PruneMentions(ctx context.Context, site string, before int64) (int64, error) {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM mentions WHERE site_id = ? AND posted_at < ?`, site, before)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// MentionCursor is where one source was last looked at for one site.
type MentionCursor struct {
	Cursor    int64 // newest post seen (unix seconds)
	ETag      string
	CheckedAt int64
}

// MentionCursors reads where a source was last looked at, for every site.
func (s *Store) MentionCursors(ctx context.Context, source string) (map[string]MentionCursor, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT site_id, cursor, etag, checked_at FROM mention_cursor WHERE source = ?`, source)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]MentionCursor{}
	for rows.Next() {
		var site string
		var c MentionCursor
		if err := rows.Scan(&site, &c.Cursor, &c.ETag, &c.CheckedAt); err != nil {
			return nil, err
		}
		out[site] = c
	}
	return out, rows.Err()
}

// SaveMentionCursor remembers where a source was looked at.
func (s *Store) SaveMentionCursor(ctx context.Context, site, source string, c MentionCursor) error {
	_, err := s.DB.ExecContext(ctx, `INSERT INTO mention_cursor (site_id, source, cursor, etag, checked_at) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (site_id, source) DO UPDATE SET cursor = excluded.cursor, etag = excluded.etag, checked_at = excluded.checked_at`,
		site, source, c.Cursor, c.ETag, c.CheckedAt)
	return err
}

// SortMentionsDue puts the sites looked at longest ago first.
func SortMentionsDue(sites []SiteRow, cur map[string]MentionCursor) {
	sort.SliceStable(sites, func(i, j int) bool { return cur[sites[i].ID].CheckedAt < cur[sites[j].ID].CheckedAt })
}

// MarkFront records that these Hacker News items are on the front page now.
func (s *Store) MarkFront(ctx context.Context, urls []string) error {
	for _, u := range urls {
		if _, err := s.DB.ExecContext(ctx, `UPDATE mentions SET front = 1 WHERE source = 'hn' AND url = ? AND front = 0`, u); err != nil {
			return err
		}
	}
	return nil
}
