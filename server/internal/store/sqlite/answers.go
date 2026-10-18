package sqlite

import (
	"context"
	"database/sql"
	"strconv"
	"strings"
)

// AnswerSite is the schedule of one site's Answers.
type AnswerSite struct {
	SiteID  string
	Country string
	NextAt  int64 // 0 = due now
	Round   int64 // the round in progress (unix seconds it began); 0 = none
	AskedAt int64 // last "Ask now"
	// Frozen are the question ids the running round asks: fixed when it began,
	// so a save made during a round applies from the next one.
	Frozen []int64
}

// AnswerQuestion is one question a site asks.
type AnswerQuestion struct {
	ID     int64  `json:"id"`
	Text   string `json:"text"`
	Active bool   `json:"active"`
}

// AnswerCompetitor is another site to compare with.
type AnswerCompetitor struct {
	Name   string `json:"name"`
	Domain string `json:"domain"`
}

// AnswerRival is how a run treated a competitor.
type AnswerRival struct {
	Name     string
	Named    bool
	Cited    bool
	Position int
}

// AnswerRun is one ask of one engine. Citations, Sources and CitedPaths are
// the JSON lists the table keeps.
type AnswerRun struct {
	ID, QuestionID, Round, AskedAt, CostMicros int64
	SiteID, Engine, Model, Error, Text         string
	Run, Position                              int
	OK, Named, Cited                           bool
	Citations, Sources, CitedPaths             string
	Rivals                                     []AnswerRival
}

// AnswerChange is what a finished round changed for one question and engine.
type AnswerChange struct {
	SiteID     string
	QuestionID int64
	Question   string
	Engine     string
	Round      int64
	At         int64
	Kind       string // seen | dropped
	FirstEver  bool
	Alerted    bool
}

// AnswerRound is one round's totals: runs that succeeded, and how many of them
// named or linked the site.
type AnswerRound struct {
	Round, Seen, Total int64
}

// AnswerPausedKey is the meta key holding when a paused budget ends (unix seconds).
const AnswerPausedKey = "answers_paused_until"

// AnswerSiteOf reads a site's schedule; a site that never had one is due now.
func (s *Store) AnswerSiteOf(ctx context.Context, site string) (AnswerSite, error) {
	a := AnswerSite{SiteID: site}
	var frozen string
	err := s.DB.QueryRowContext(ctx, `SELECT country, next_at, round, asked_at, frozen FROM answer_sites WHERE site_id = ?`, site).
		Scan(&a.Country, &a.NextAt, &a.Round, &a.AskedAt, &frozen)
	if err == sql.ErrNoRows {
		return a, nil
	}
	a.Frozen = parseIDs(frozen)
	return a, err
}

func (s *Store) ensureAnswerSite(ctx context.Context, site string, now int64) error {
	_, err := s.DB.ExecContext(ctx, `INSERT OR IGNORE INTO answer_sites (site_id, updated_at) VALUES (?, ?)`, site, now)
	return err
}

// SetAnswerCountry keeps the country the questions are asked from.
func (s *Store) SetAnswerCountry(ctx context.Context, site, country string, now int64) error {
	if err := s.ensureAnswerSite(ctx, site, now); err != nil {
		return err
	}
	_, err := s.DB.ExecContext(ctx, `UPDATE answer_sites SET country = ?, updated_at = ? WHERE site_id = ?`, country, now, site)
	return err
}

// AskAnswersNow makes the site due now and notes when it was asked.
func (s *Store) AskAnswersNow(ctx context.Context, site string, now int64) error {
	if err := s.ensureAnswerSite(ctx, site, now); err != nil {
		return err
	}
	_, err := s.DB.ExecContext(ctx, `UPDATE answer_sites SET next_at = 0, asked_at = ?, updated_at = ? WHERE site_id = ?`, now, now, site)
	return err
}

// AnswerQuestionsOf lists a site's questions, oldest first.
func (s *Store) AnswerQuestionsOf(ctx context.Context, site string) ([]AnswerQuestion, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, text, active FROM answer_questions WHERE site_id = ? ORDER BY id`, site)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AnswerQuestion{}
	for rows.Next() {
		var q AnswerQuestion
		if err := rows.Scan(&q.ID, &q.Text, &q.Active); err != nil {
			return nil, err
		}
		out = append(out, q)
	}
	return out, rows.Err()
}

// SetAnswerQuestions makes the list what a site asks. A question with an id
// whose text is unchanged keeps its history; changed text is a new question,
// and a question left out is deleted with its runs.
func (s *Store) SetAnswerQuestions(ctx context.Context, site string, list []AnswerQuestion, now int64) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck // a rollback after commit is a no-op
	old := map[int64]string{}
	rows, err := tx.QueryContext(ctx, `SELECT id, text FROM answer_questions WHERE site_id = ?`, site)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id int64
		var text string
		if err := rows.Scan(&id, &text); err != nil {
			rows.Close()
			return err
		}
		old[id] = text
	}
	rows.Close()
	keep := map[int64]bool{}
	for _, q := range list {
		if t, ok := old[q.ID]; ok && strings.EqualFold(t, q.Text) {
			keep[q.ID] = true
		}
	}
	for id := range old {
		if !keep[id] {
			if _, err := tx.ExecContext(ctx, `DELETE FROM answer_questions WHERE id = ?`, id); err != nil {
				return err
			}
		}
	}
	for _, q := range list {
		if keep[q.ID] {
			_, err = tx.ExecContext(ctx, `UPDATE answer_questions SET text = ?, active = ? WHERE id = ?`, q.Text, q.Active, q.ID)
		} else {
			_, err = tx.ExecContext(ctx, `INSERT INTO answer_questions (site_id, text, active, created_at) VALUES (?, ?, ?, ?)`, site, q.Text, q.Active, now)
		}
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}

// AnswerCompetitorsOf lists the sites a site compares with.
func (s *Store) AnswerCompetitorsOf(ctx context.Context, site string) ([]AnswerCompetitor, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT name, domain FROM answer_competitors WHERE site_id = ? ORDER BY created_at, name`, site)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AnswerCompetitor{}
	for rows.Next() {
		var c AnswerCompetitor
		if err := rows.Scan(&c.Name, &c.Domain); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// SetAnswerCompetitors replaces the list.
func (s *Store) SetAnswerCompetitors(ctx context.Context, site string, list []AnswerCompetitor, now int64) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck // a rollback after commit is a no-op
	if _, err := tx.ExecContext(ctx, `DELETE FROM answer_competitors WHERE site_id = ?`, site); err != nil {
		return err
	}
	for i, c := range list {
		if _, err := tx.ExecContext(ctx, `INSERT INTO answer_competitors (site_id, name, domain, created_at) VALUES (?, ?, ?, ?)`, site, c.Name, c.Domain, now+int64(i)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// AnswerSitesInProgress lists the sites with a round still asking.
func (s *Store) AnswerSitesInProgress(ctx context.Context) ([]AnswerSite, error) {
	return s.answerSites(ctx, `SELECT site_id, country, next_at, round, asked_at, frozen FROM answer_sites a WHERE round != 0
		AND EXISTS (SELECT 1 FROM answer_questions q WHERE q.site_id = a.site_id) ORDER BY round`, nil)
}

// AnswerSitesDue lists the sites with an active question whose next round is
// due and none running, the longest waiting first.
func (s *Store) AnswerSitesDue(ctx context.Context, now int64, limit int) ([]AnswerSite, error) {
	return s.answerSites(ctx, `SELECT q.site_id, coalesce(a.country, ''), coalesce(a.next_at, 0), coalesce(a.round, 0), coalesce(a.asked_at, 0), coalesce(a.frozen, '')
		FROM (SELECT DISTINCT site_id FROM answer_questions WHERE active = 1) q LEFT JOIN answer_sites a ON a.site_id = q.site_id
		WHERE coalesce(a.round, 0) = 0 AND coalesce(a.next_at, 0) <= ? ORDER BY coalesce(a.next_at, 0), q.site_id LIMIT ?`, []any{now, limit})
}

func (s *Store) answerSites(ctx context.Context, query string, args []any) ([]AnswerSite, error) {
	rows, err := s.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AnswerSite
	for rows.Next() {
		var a AnswerSite
		var frozen string
		if err := rows.Scan(&a.SiteID, &a.Country, &a.NextAt, &a.Round, &a.AskedAt, &frozen); err != nil {
			return nil, err
		}
		a.Frozen = parseIDs(frozen)
		out = append(out, a)
	}
	return out, rows.Err()
}

// AnswerSitesWithQuestions counts the sites that ask something, for the fair share of the budget.
func (s *Store) AnswerSitesWithQuestions(ctx context.Context) (n int, err error) {
	err = s.DB.QueryRowContext(ctx, `SELECT count(DISTINCT site_id) FROM answer_questions WHERE active = 1`).Scan(&n)
	return n, err
}

// StartAnswerRound marks a round as running, with the questions it asks and
// the budget it holds (micro-USD), both kept so a restart resumes the same round.
func (s *Store) StartAnswerRound(ctx context.Context, site string, round int64, questions []int64, reserved, now int64) error {
	if err := s.ensureAnswerSite(ctx, site, now); err != nil {
		return err
	}
	ids := make([]string, len(questions))
	for i, q := range questions {
		ids[i] = strconv.FormatInt(q, 10)
	}
	_, err := s.DB.ExecContext(ctx, `UPDATE answer_sites SET round = ?, frozen = ?, reserved = ?, updated_at = ? WHERE site_id = ?`, round, strings.Join(ids, ","), reserved, now, site)
	return err
}

func parseIDs(s string) []int64 {
	var out []int64
	for _, p := range strings.Split(s, ",") {
		if n, err := strconv.ParseInt(p, 10, 64); err == nil {
			out = append(out, n)
		}
	}
	return out
}

// AnswerReserved is the budget every running round still holds, in micro-USD.
func (s *Store) AnswerReserved(ctx context.Context) (n int64, err error) {
	err = s.DB.QueryRowContext(ctx, `SELECT coalesce(sum(reserved), 0) FROM answer_sites WHERE round != 0`).Scan(&n)
	return n, err
}

// ReleaseAnswerReserve lowers what a running round holds, as its asks are paid for.
func (s *Store) ReleaseAnswerReserve(ctx context.Context, site string, n int64) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE answer_sites SET reserved = max(reserved - ?, 0) WHERE site_id = ?`, n, site)
	return err
}

// DelayAnswers moves a site's next round to the given time (a site the budget
// refused waits for next month instead of being looked at every tick).
func (s *Store) DelayAnswers(ctx context.Context, site string, until, now int64) error {
	if err := s.ensureAnswerSite(ctx, site, now); err != nil {
		return err
	}
	_, err := s.DB.ExecContext(ctx, `UPDATE answer_sites SET next_at = ?, updated_at = ? WHERE site_id = ?`, until, now, site)
	return err
}

// AddAnswerSpend adds to a month's estimated spend: the cost of a call whose
// answer could not be kept.
func (s *Store) AddAnswerSpend(ctx context.Context, month string, micros int64) error {
	_, err := s.DB.ExecContext(ctx, `INSERT INTO answer_spend (month, cost_micros) VALUES (?, ?)
		ON CONFLICT(month) DO UPDATE SET cost_micros = cost_micros + excluded.cost_micros`, month, micros)
	return err
}

// AnswerDone lists the (question, engine, run) triples already stored for a round.
func (s *Store) AnswerDone(ctx context.Context, site string, round int64) (map[string]bool, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT question_id, engine, run FROM answer_runs WHERE site_id = ? AND round = ?`, site, round)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var q int64
		var e string
		var r int
		if err := rows.Scan(&q, &e, &r); err != nil {
			return nil, err
		}
		out[DoneKey(q, e, r)] = true
	}
	return out, rows.Err()
}

// DoneKey names one (question, engine, run) in AnswerDone's map.
func DoneKey(q int64, engine string, run int) string {
	return strconv.FormatInt(q, 10) + "/" + engine + "/" + strconv.Itoa(run)
}

func empty(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

// SaveAnswerRun stores one run with its rivals and adds its cost to the month,
// in one transaction. A run already stored for that slot is left alone.
func (s *Store) SaveAnswerRun(ctx context.Context, r AnswerRun, month string) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck // a rollback after commit is a no-op
	res, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO answer_runs
		(site_id, question_id, round, engine, model, run, asked_at, ok, error, text, citations, sources, named, cited, position, cited_paths, cost_micros)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		r.SiteID, r.QuestionID, r.Round, r.Engine, r.Model, r.Run, r.AskedAt, r.OK, r.Error, r.Text,
		empty(r.Citations, "[]"), empty(r.Sources, "[]"), r.Named, r.Cited, r.Position, empty(r.CitedPaths, "[]"), r.CostMicros)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return tx.Commit()
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	for _, v := range r.Rivals {
		if _, err := tx.ExecContext(ctx, `INSERT INTO answer_rivals (run_id, name, named, cited, position) VALUES (?, ?, ?, ?, ?)`,
			id, v.Name, v.Named, v.Cited, v.Position); err != nil {
			return err
		}
	}
	if r.CostMicros > 0 {
		if _, err := tx.ExecContext(ctx, `INSERT INTO answer_spend (month, cost_micros) VALUES (?, ?)
			ON CONFLICT(month) DO UPDATE SET cost_micros = cost_micros + excluded.cost_micros`, month, r.CostMicros); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// AnswerSpend is the estimated cost of a month ("2026-10"), in micro-USD.
func (s *Store) AnswerSpend(ctx context.Context, month string) (int64, error) {
	var n int64
	err := s.DB.QueryRowContext(ctx, `SELECT cost_micros FROM answer_spend WHERE month = ?`, month).Scan(&n)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return n, err
}

// FinishAnswerRound ends a round: it writes what changed, clears the round and
// sets when the next one is due. seen: some run of the round named or linked
// the site, and it never had before. dropped: seen in each of the two rounds
// before, and in none now.
func (s *Store) FinishAnswerRound(ctx context.Context, site string, round, nextAt, now int64) ([]AnswerChange, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback() //nolint:errcheck // a rollback after commit is a no-op
	type key struct {
		q int64
		e string
	}
	seenNow := map[key]bool{}
	var order []key
	rows, err := tx.QueryContext(ctx, `SELECT question_id, engine, max(named OR cited) FROM answer_runs WHERE site_id = ? AND round = ? AND ok = 1 GROUP BY question_id, engine ORDER BY question_id, engine`, site, round)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var k key
		var seen bool
		if err := rows.Scan(&k.q, &k.e, &seen); err != nil {
			rows.Close()
			return nil, err
		}
		seenNow[k] = seen
		order = append(order, k)
	}
	rows.Close()
	var anySeenBefore bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM answer_changes WHERE site_id = ? AND kind = 'seen')`, site).Scan(&anySeenBefore); err != nil {
		return nil, err
	}
	var out []AnswerChange
	for _, k := range order {
		ch := AnswerChange{SiteID: site, QuestionID: k.q, Engine: k.e, Round: round}
		if seenNow[k] {
			var before bool
			if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM answer_runs WHERE question_id = ? AND engine = ? AND round < ? AND ok = 1 AND (named OR cited))
				OR EXISTS (SELECT 1 FROM answer_changes WHERE question_id = ? AND engine = ? AND kind = 'seen' AND round < ?)`, k.q, k.e, round, k.q, k.e, round).Scan(&before); err != nil {
				return nil, err
			}
			if before {
				continue
			}
			ch.Kind = "seen"
			ch.FirstEver = !anySeenBefore
			anySeenBefore = true
		} else {
			prev, err := tx.QueryContext(ctx, `SELECT max(named OR cited) FROM answer_runs WHERE question_id = ? AND engine = ? AND round < ? AND ok = 1 GROUP BY round ORDER BY round DESC LIMIT 2`, k.q, k.e, round)
			if err != nil {
				return nil, err
			}
			both, n := true, 0
			for prev.Next() {
				var seen bool
				if err := prev.Scan(&seen); err != nil {
					prev.Close()
					return nil, err
				}
				both = both && seen
				n++
			}
			prev.Close()
			if n < 2 || !both {
				continue
			}
			ch.Kind = "dropped"
		}
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO answer_changes (site_id, question_id, engine, round, kind, first_ever) VALUES (?, ?, ?, ?, ?, ?)`,
			site, k.q, k.e, round, ch.Kind, ch.FirstEver); err != nil {
			return nil, err
		}
		out = append(out, ch)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE answer_sites SET round = 0, frozen = '', reserved = 0, next_at = ?, updated_at = ? WHERE site_id = ?`, nextAt, now, site); err != nil {
		return nil, err
	}
	return out, tx.Commit()
}

// AnswerDropsToTell lists dropped changes not yet alerted.
func (s *Store) AnswerDropsToTell(ctx context.Context, site string) ([]AnswerChange, error) {
	return s.answerChanges(ctx, site, true, 0, 0)
}

// MarkAnswerAlerted notes that a change was told.
func (s *Store) MarkAnswerAlerted(ctx context.Context, c AnswerChange) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE answer_changes SET alerted = 1 WHERE site_id = ? AND question_id = ? AND engine = ? AND round = ?`, c.SiteID, c.QuestionID, c.Engine, c.Round)
	return err
}

// AnswerChangesIn lists the changes of rounds that began since the given time, newest first.
func (s *Store) AnswerChangesIn(ctx context.Context, site string, since int64, limit int) ([]AnswerChange, error) {
	return s.answerChanges(ctx, site, false, since, limit)
}

// answerChanges reads a site's changes: the dropped ones not yet told, or all
// of those from `since` on, newest first (limit 0 is no limit).
func (s *Store) answerChanges(ctx context.Context, site string, untold bool, since int64, limit int) ([]AnswerChange, error) {
	if limit <= 0 {
		limit = -1
	}
	rows, err := s.DB.QueryContext(ctx, `SELECT c.site_id, c.question_id, qs.text, c.engine, c.round, c.kind, c.first_ever, c.alerted,
		coalesce((SELECT max(r.asked_at) FROM answer_runs r WHERE r.question_id = c.question_id AND r.round = c.round AND r.engine = c.engine), c.round)
		FROM answer_changes c JOIN answer_questions qs ON qs.id = c.question_id
		WHERE c.site_id = ? AND (CASE WHEN ? THEN c.kind = 'dropped' AND c.alerted = 0 ELSE c.round >= ? END)
		ORDER BY CASE WHEN ? THEN c.round ELSE -c.round END, c.question_id, c.engine LIMIT ?`, site, untold, since, untold, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AnswerChange
	for rows.Next() {
		var c AnswerChange
		if err := rows.Scan(&c.SiteID, &c.QuestionID, &c.Question, &c.Engine, &c.Round, &c.Kind, &c.FirstEver, &c.Alerted, &c.At); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// AnswerRounds lists every round with runs, oldest first: its ok runs and how
// many of them named or linked the site.
func (s *Store) AnswerRounds(ctx context.Context, site string) ([]AnswerRound, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT round, coalesce(sum(named OR cited), 0), count(*) FROM answer_runs WHERE site_id = ? AND ok = 1 GROUP BY round ORDER BY round`, site)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AnswerRound
	for rows.Next() {
		var r AnswerRound
		if err := rows.Scan(&r.Round, &r.Seen, &r.Total); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// AnswerRunsOf lists a round's runs, with their rivals but without the long text.
func (s *Store) AnswerRunsOf(ctx context.Context, site string, round int64) ([]AnswerRun, error) {
	return s.answerRuns(ctx, site, round, 0, 0, false)
}

// AnswerQuestionRuns lists the runs of one question over its last `rounds` rounds, newest first, with text.
func (s *Store) AnswerQuestionRuns(ctx context.Context, site string, question int64, rounds int) ([]AnswerRun, error) {
	return s.answerRuns(ctx, site, 0, question, rounds, true)
}

// answerRuns reads runs of one round (round != 0) or of one question's last
// `rounds` rounds (question != 0).
func (s *Store) answerRuns(ctx context.Context, site string, round, question int64, rounds int, withText bool) ([]AnswerRun, error) {
	const where = `r.site_id = ? AND (? = 0 OR r.round = ?) AND (? = 0 OR r.question_id = ?)
		AND (? = 0 OR r.round IN (SELECT DISTINCT round FROM answer_runs WHERE question_id = ? ORDER BY round DESC LIMIT ?))`
	args := []any{site, round, round, question, question, rounds, question, max(rounds, 1)}
	rows, err := s.DB.QueryContext(ctx, `SELECT r.id, r.site_id, r.question_id, r.round, r.engine, r.model, r.run, r.asked_at, r.ok, r.error,
		CASE WHEN ? THEN r.text ELSE '' END, r.citations, CASE WHEN ? THEN r.sources ELSE '[]' END, r.named, r.cited, r.position, r.cited_paths, r.cost_micros
		FROM answer_runs r WHERE `+where+` ORDER BY r.round DESC, r.question_id, r.engine, r.run`, append([]any{withText, withText}, args...)...)
	if err != nil {
		return nil, err
	}
	var out []AnswerRun
	byID := map[int64]int{}
	for rows.Next() {
		var r AnswerRun
		if err := rows.Scan(&r.ID, &r.SiteID, &r.QuestionID, &r.Round, &r.Engine, &r.Model, &r.Run, &r.AskedAt, &r.OK, &r.Error, &r.Text,
			&r.Citations, &r.Sources, &r.Named, &r.Cited, &r.Position, &r.CitedPaths, &r.CostMicros); err != nil {
			rows.Close()
			return nil, err
		}
		byID[r.ID] = len(out)
		out = append(out, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil || len(out) == 0 {
		return out, err
	}
	rr, err := s.DB.QueryContext(ctx, `SELECT v.run_id, v.name, v.named, v.cited, v.position FROM answer_rivals v JOIN answer_runs r ON r.id = v.run_id WHERE `+where+` ORDER BY v.run_id, v.name`, args...)
	if err != nil {
		return nil, err
	}
	defer rr.Close()
	for rr.Next() {
		var id int64
		var v AnswerRival
		if err := rr.Scan(&id, &v.Name, &v.Named, &v.Cited, &v.Position); err != nil {
			return nil, err
		}
		if i, ok := byID[id]; ok {
			out[i].Rivals = append(out[i].Rivals, v)
		}
	}
	return out, rr.Err()
}

// AnswerCitedPaths counts, for rounds that began in [since, until], how many ok
// runs linked each same-host page.
func (s *Store) AnswerCitedPaths(ctx context.Context, site string, since, until int64) (map[string]int, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT j.value, count(*) FROM answer_runs r, json_each(r.cited_paths) j
		WHERE r.site_id = ? AND r.ok = 1 AND r.round >= ? AND r.round <= ? GROUP BY j.value`, site, since, until)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var p string
		var n int
		if err := rows.Scan(&p, &n); err != nil {
			return nil, err
		}
		out[p] = n
	}
	return out, rows.Err()
}

// AnswerCitedURLs lists every cited address of a site's answers with how often, for suggesting rivals.
func (s *Store) AnswerCitedURLs(ctx context.Context, site string) (map[string]int, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT json_extract(j.value, '$.url'), count(*) FROM answer_runs r, json_each(r.citations) j
		WHERE r.site_id = ? AND r.ok = 1 GROUP BY 1`, site)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var u sql.NullString
		var n int
		if err := rows.Scan(&u, &n); err != nil {
			return nil, err
		}
		if u.Valid {
			out[u.String] = n
		}
	}
	return out, rows.Err()
}

// PruneAnswers deletes a site's runs older than the cutoff and blanks the text
// of every round but the newest `keep`. The scores stay.
func (s *Store) PruneAnswers(ctx context.Context, site string, cutoff int64, keep int) (int64, error) {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM answer_runs WHERE site_id = ? AND round < ?`, site, cutoff)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	if _, err := s.DB.ExecContext(ctx, `DELETE FROM answer_changes WHERE site_id = ? AND round < ?`, site, cutoff); err != nil {
		return n, err
	}
	_, err = s.DB.ExecContext(ctx, `UPDATE answer_runs SET text = '', sources = '[]'
		WHERE site_id = ? AND (text != '' OR sources != '[]') AND round NOT IN (SELECT DISTINCT round FROM answer_runs WHERE site_id = ? ORDER BY round DESC LIMIT ?)`, site, site, keep)
	return n, err
}

// AnswerSiteIDs lists the sites that have any Answers data, for the retention pass.
func (s *Store) AnswerSiteIDs(ctx context.Context) ([]string, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT DISTINCT site_id FROM answer_runs`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// AnswerSiteSpend is what a site's runs cost since the given time (unix seconds), in micro-USD.
func (s *Store) AnswerSiteSpend(ctx context.Context, site string, since int64) (n int64, err error) {
	err = s.DB.QueryRowContext(ctx, `SELECT coalesce(sum(cost_micros), 0) FROM answer_runs WHERE site_id = ? AND asked_at >= ?`, site, since).Scan(&n)
	return n, err
}
