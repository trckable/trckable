package query

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"time"
)

// Answering a data request: what is held about one person, in a form they can
// read, and a straight answer about what an erasure will and will not remove.

// PersonFound is the summary shown before anything is exported or erased, so
// the owner can see they are about to act on the right visitor.
type PersonFound struct {
	Visitor   string     `json:"visitor"` // base 36, the id used everywhere else
	Events    int64      `json:"events"`
	Sessions  int64      `json:"sessions"`
	FirstSeen *time.Time `json:"first_seen,omitempty"`
	LastSeen  *time.Time `json:"last_seen,omitempty"`
	Countries []string   `json:"countries,omitempty"`
}

// FindPerson counts what this site holds for one visitor.
func (q Q) FindPerson(ctx context.Context, site string, visitor uint64) (PersonFound, error) {
	conn, err := q.conn(ctx, site)
	if err != nil {
		return PersonFound{}, err
	}
	defer q.done(conn)
	out := PersonFound{Visitor: strconv.FormatUint(visitor, 36)}
	// Visitor ids are unsigned 64-bit and our own, so they go in as literals:
	// database/sql refuses the ones with the high bit set.
	id := strconv.FormatUint(visitor, 10)
	var first, last sql.NullTime
	err = conn.QueryRowContext(ctx, `
		SELECT count(*), min(coalesce(first_seen, ts)), max(ts)
		FROM events WHERE site_id = ? AND visitor_id = `+id, site).Scan(&out.Events, &first, &last)
	if err != nil {
		return out, fmt.Errorf("find person: %w", err)
	}
	if first.Valid {
		out.FirstSeen = &first.Time
	}
	if last.Valid {
		out.LastSeen = &last.Time
	}
	if err := conn.QueryRowContext(ctx, `
		SELECT count(*) FROM (SELECT * FROM sessions UNION ALL SELECT * FROM s_open)
		WHERE site_id = ? AND visitor_id = `+id, site).Scan(&out.Sessions); err != nil {
		return out, fmt.Errorf("find person sessions: %w", err)
	}
	rows, err := conn.QueryContext(ctx, `
		SELECT DISTINCT country FROM (SELECT * FROM sessions UNION ALL SELECT * FROM s_open)
		WHERE site_id = ? AND visitor_id = `+id+` AND country IS NOT NULL AND country <> '' ORDER BY 1`, site)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return out, err
		}
		out.Countries = append(out.Countries, c)
	}
	return out, rows.Err()
}

// PersonExport is everything this instance holds about one visitor, as the
// file handed to them. It is deliberately the same shape as the journey view:
// there is nothing kept back, because there is nothing else kept.
type PersonExport struct {
	Site      string         `json:"site"`
	Visitor   string         `json:"visitor"`
	MadeAt    time.Time      `json:"made_at"`
	Note      string         `json:"note"`
	FirstSeen *time.Time     `json:"first_seen,omitempty"`
	Visits    []JourneyVisit `json:"visits"`
	Truncated bool           `json:"truncated,omitempty"`
}

// ExportPerson gathers a visitor's whole history. Payments are added by the
// caller, which is the only place that can read the money ledger.
func (q Q) ExportPerson(ctx context.Context, site, domain string, visitor uint64, now time.Time) (*PersonExport, error) {
	j, err := q.Journey(ctx, site, visitor, now.AddDate(100, 0, 0))
	if err != nil {
		return nil, err
	}
	return &PersonExport{
		Site:    domain,
		Visitor: strconv.FormatUint(visitor, 36),
		MadeAt:  now.UTC(),
		Note: "Everything " + domain + " recorded for this visitor. trckable never stores IP addresses, " +
			"and the visitor id is a hash, not a name. Timestamps are UTC.",
		FirstSeen: j.FirstSeen,
		Visits:    j.Visits,
		Truncated: j.Truncated,
	}, nil
}
