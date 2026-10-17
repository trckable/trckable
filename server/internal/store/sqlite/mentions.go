package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/trckable/trckable/server/internal/mentions"
)

// MaxKeywords is how many extra search words a site may add; its address is
// always searched on top of them.
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
	State    string `json:"state,omitempty"` // shown | hidden | rejected | pending
	Via      string `json:"via,omitempty"`   // domain | name | page: how it matched; "page" is confirmed by visits
	Link     string `json:"-"`               // what it points at
}

// What a mention's state says: only a shown one is counted or listed.
const (
	MentionShown    = "shown"
	MentionHidden   = "hidden"   // the owner said "Not about us"
	MentionRejected = "rejected" // a judge said it is not about the site
	MentionPending  = "pending"  // a judge has not answered yet
)

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

// SearchWords are every word a site is searched for: its address (with and
// without "www."), then the names added. In that order, no repeats.
func (s *Store) SearchWords(ctx context.Context, site SiteRow) ([]string, error) {
	added, err := s.MentionKeywords(ctx, site.ID)
	if err != nil {
		return nil, err
	}
	return JoinWords(site, added), nil
}

// JoinWords is SearchWords for words already read. Only the address is a
// default: the bare name in it ("acme" for acme.example) also names people,
// places and other sites, so it is searched only when its owner adds it, and
// even then it counts only with a topic word beside it (mentions.Rules).
func JoinWords(site SiteRow, added []string) []string {
	out := []string{}
	seen := map[string]bool{}
	domain := strings.TrimSpace(site.Domain)
	bare := strings.TrimPrefix(strings.ToLower(domain), "www.")
	for _, k := range append([]string{bare, "www." + bare}, added...) {
		k = strings.TrimSpace(k)
		if utf8.RuneCountInString(k) < 3 || seen[strings.ToLower(k)] {
			continue
		}
		seen[strings.ToLower(k)] = true
		out = append(out, k)
	}
	return out
}

// MentionRules are the owner's rules for what counts as a mention of a site.
type MentionRules struct {
	Topic    []string `json:"topic"`    // words that must stand beside a name word
	Required []string `json:"required"` // words that must all be in an item
	Excluded []string `json:"excluded"` // words that rule an item out
	Blocked  []string `json:"blocked"`  // sites whose items never count
}

// MaxRules is how many words or sites each rule list may hold.
const MaxRules = 20

var ruleKinds = map[string]func(*MentionRules) *[]string{
	"topic":    func(r *MentionRules) *[]string { return &r.Topic },
	"required": func(r *MentionRules) *[]string { return &r.Required },
	"excluded": func(r *MentionRules) *[]string { return &r.Excluded },
	"blocked":  func(r *MentionRules) *[]string { return &r.Blocked },
}

// MentionRules reads a site's rules; empty lists, never nil.
func (s *Store) MentionRules(ctx context.Context, site string) (MentionRules, error) {
	out := MentionRules{Topic: []string{}, Required: []string{}, Excluded: []string{}, Blocked: []string{}}
	rows, err := s.DB.QueryContext(ctx, `SELECT kind, value FROM mention_rules WHERE site_id = ? ORDER BY kind, value`, site)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var kind, value string
		if err := rows.Scan(&kind, &value); err != nil {
			return out, err
		}
		if f := ruleKinds[kind]; f != nil {
			l := f(&out)
			*l = append(*l, value)
		}
	}
	return out, rows.Err()
}

// CleanRules trims, drops empty and repeated entries (in any case), turns
// blocked sites into bare hosts, and refuses too many or too long.
func CleanRules(in MentionRules) (MentionRules, error) {
	var out MentionRules
	for kind, get := range ruleKinds {
		src := *get(&in)
		seen := map[string]bool{}
		list := []string{}
		for _, v := range src {
			v = strings.Join(strings.Fields(v), " ")
			if kind == "blocked" {
				v = mentions.BlockedHost(v)
			}
			if v == "" || seen[strings.ToLower(v)] {
				continue
			}
			if n := utf8.RuneCountInString(v); n < 2 || n > 60 || strings.ContainsAny(v, `"<>`) {
				return out, errors.Join(ErrKeywords, errors.New("each entry is 2 to 60 characters, without quotes"))
			}
			seen[strings.ToLower(v)] = true
			list = append(list, v)
		}
		if len(list) > MaxRules {
			return out, errors.Join(ErrKeywords, errors.New("at most 20 entries in each list"))
		}
		*ruleKinds[kind](&out) = list
	}
	return out, nil
}

// SetMentionRules replaces a site's rules.
func (s *Store) SetMentionRules(ctx context.Context, site string, r MentionRules) error {
	r, err := CleanRules(r)
	if err != nil {
		return err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `DELETE FROM mention_rules WHERE site_id = ?`, site); err != nil {
		return err
	}
	for kind, get := range ruleKinds {
		for _, v := range *get(&r) {
			if _, err := tx.ExecContext(ctx, `INSERT INTO mention_rules (site_id, kind, value) VALUES (?, ?, ?)`, site, kind, v); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

// MatchRules is everything the matcher needs for one site.
func (s *Store) MatchRules(ctx context.Context, site SiteRow) (mentions.Rules, error) {
	names, err := s.MentionKeywords(ctx, site.ID)
	if err != nil {
		return mentions.Rules{}, err
	}
	r, err := s.MentionRules(ctx, site.ID)
	if err != nil {
		return mentions.Rules{}, err
	}
	return mentions.Rules{Domain: site.Domain, Names: names, Topic: r.Topic, Required: r.Required, Excluded: r.Excluded, Blocked: r.Blocked}, nil
}

// SaveMention keeps a mention the first time it is seen and, after that, only
// what can change (a title edited, points gained, reaching the front page).
// It says whether the mention is new.
func (s *Store) SaveMention(ctx context.Context, m Mention, now int64) (bool, error) {
	if m.State == "" {
		m.State = MentionShown
	}
	res, err := s.DB.ExecContext(ctx, `INSERT INTO mentions (site_id, source, url, kind, title, author, host, points, comments, snippet, front, posted_at, found_at, state, via, link)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (site_id, url) DO NOTHING`,
		m.Site, m.Source, m.URL, m.Kind, m.Title, m.Author, m.Host, m.Points, m.Comments, m.Snippet, boolInt(m.Front), m.PostedAt, now, m.State, m.Via, m.Link)
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

const mentionCols = `id, site_id, source, url, kind, title, author, host, points, comments, snippet, front, posted_at, found_at, visitors, peak_hour, scored_at, alerted, state, via, link`

func scanMentions(rows interface {
	Next() bool
	Scan(...any) error
	Err() error
}) ([]Mention, error) {
	out := []Mention{}
	for rows.Next() {
		var m Mention
		var front, alerted int
		if err := rows.Scan(&m.ID, &m.Site, &m.Source, &m.URL, &m.Kind, &m.Title, &m.Author, &m.Host, &m.Points, &m.Comments, &m.Snippet, &front, &m.PostedAt, &m.FoundAt, &m.Visitors, &m.PeakHour, &m.ScoredAt, &alerted, &m.State, &m.Via, &m.Link); err != nil {
			return nil, err
		}
		m.Front, m.Alerted = front == 1, alerted == 1
		out = append(out, m)
	}
	return out, rows.Err()
}

// Mentions lists a site's shown mentions posted in [from, to), newest first,
// at most limit. These are the rows every count reads: a mention that is
// hidden, rejected or waiting for a judge is not here, so no count is higher
// than the rows a person can see.
func (s *Store) Mentions(ctx context.Context, site string, from, to int64, limit int) ([]Mention, error) {
	return s.mentionsIn(ctx, site, from, to, limit, MentionShown)
}

// HiddenMentions lists what a site's owner or a judge kept out of the list.
func (s *Store) HiddenMentions(ctx context.Context, site string, limit int) ([]Mention, error) {
	return s.mentionsIn(ctx, site, 0, 1<<40, limit, MentionHidden, MentionRejected)
}

// AllMentions lists a mention of any state: for the finder, which must not
// find again what was hidden.
func (s *Store) AllMentions(ctx context.Context, site string, from, to int64, limit int) ([]Mention, error) {
	return s.mentionsIn(ctx, site, from, to, limit, MentionShown, MentionHidden, MentionRejected, MentionPending)
}

// PendingMentions lists the mentions a judge has not answered for.
func (s *Store) PendingMentions(ctx context.Context, site string, limit int) ([]Mention, error) {
	return s.mentionsIn(ctx, site, 0, 1<<40, limit, MentionPending)
}

func (s *Store) mentionsIn(ctx context.Context, site string, from, to int64, limit int, states ...string) ([]Mention, error) {
	marks := strings.TrimSuffix(strings.Repeat("?,", len(states)), ",")
	args := []any{site, from, to}
	for _, st := range states {
		args = append(args, st)
	}
	query := "SELECT " + mentionCols + " FROM mentions WHERE site_id = ? AND posted_at >= ? AND posted_at < ? AND state IN (" + marks + ") ORDER BY posted_at DESC, id DESC LIMIT ?" //nolint:gosec // only "?" placeholders are joined in
	rows, err := s.DB.QueryContext(ctx, query, append(args, limit)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMentions(rows)
}

// MentionsToScore lists, for every site, the mentions whose traffic is still
// being counted: not scored yet, or posted after `since`.
func (s *Store) MentionsToScore(ctx context.Context, since int64) ([]Mention, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT `+mentionCols+` FROM mentions WHERE state = 'shown' AND via <> 'page' AND (scored_at = 0 OR posted_at >= ?) ORDER BY site_id, posted_at`, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMentions(rows)
}

// MentionsOfHost lists a site's mentions that can bring visitors through one host.
func (s *Store) MentionsOfHost(ctx context.Context, site, host string, from int64) ([]Mention, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT `+mentionCols+` FROM mentions WHERE site_id = ? AND host = ? AND posted_at >= ? AND state = 'shown' AND via <> 'page' ORDER BY posted_at, id`, site, host, from)
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

// SetMentionState shows, hides or rejects one of a site's mentions; it says
// whether the mention exists.
func (s *Store) SetMentionState(ctx context.Context, site string, id int64, state string) (bool, error) {
	res, err := s.DB.ExecContext(ctx, `UPDATE mentions SET state = ? WHERE site_id = ? AND id = ?`, state, site, id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// MentionOf reads one of a site's mentions, of any state.
func (s *Store) MentionOf(ctx context.Context, site string, id int64) (Mention, bool, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT `+mentionCols+` FROM mentions WHERE site_id = ? AND id = ?`, site, id)
	if err != nil {
		return Mention{}, false, err
	}
	defer rows.Close()
	list, err := scanMentions(rows)
	if err != nil || len(list) == 0 {
		return Mention{}, false, err
	}
	return list[0], true, nil
}

// MentionState says what state a site's mention at an address is in, and
// whether it is kept at all.
func (s *Store) MentionState(ctx context.Context, site, url string) (string, bool, error) {
	var st string
	err := s.DB.QueryRowContext(ctx, `SELECT state FROM mentions WHERE site_id = ? AND url = ?`, site, url).Scan(&st)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	return st, err == nil, err
}

// MentionsAtAddress reads the mention a site has at an address (the zero
// Mention when there is none).
func (s *Store) MentionsAtAddress(ctx context.Context, site, url string) (Mention, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT `+mentionCols+` FROM mentions WHERE site_id = ? AND url = ?`, site, url)
	if err != nil {
		return Mention{}, err
	}
	defer rows.Close()
	list, err := scanMentions(rows)
	if err != nil || len(list) == 0 {
		return Mention{}, err
	}
	return list[0], nil
}

// ConfirmMention marks a mention the visits confirmed: its page sent people.
func (s *Store) ConfirmMention(ctx context.Context, site string, id int64) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE mentions SET via = 'page' WHERE site_id = ? AND id = ? AND state = 'shown'`, site, id)
	return err
}

// DeleteMention removes one mention.
func (s *Store) DeleteMention(ctx context.Context, id int64) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM mentions WHERE id = ?`, id)
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

// SitesWithMentions are the sites that have found at least one mention.
func (s *Store) SitesWithMentions(ctx context.Context) (map[string]bool, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT DISTINCT site_id FROM mentions WHERE state = 'shown'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}
