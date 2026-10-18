package sqlite

import (
	"context"
	"sort"
	"time"
)

// Rejected hostnames: the pages that sent events for a site from a hostname it
// does not list. Only the hostname and how many, per day, for a week; the
// per-day cap keeps a script posting made-up hostnames from growing the table.
const (
	hostKeepDays = 7
	hostsPerDay  = 20
	hostsShown   = 5
)

// RejectedHost is a count of events refused for one hostname on one UTC day.
type RejectedHost struct {
	Site string
	Day  string // YYYY-MM-DD
	Host string
	N    uint64
}

// HostCount is a hostname and how many events came from it.
type HostCount struct {
	Host string `json:"host"`
	N    int64  `json:"n"`
}

// RejectedHosts is the top hostnames of the last week and the count over all.
type RejectedHosts struct {
	Hosts []HostCount `json:"hosts"`
	Total int64       `json:"total"`
}

// AddRejectedHosts adds counts, drops days older than a week, and keeps at
// most hostsPerDay hostnames a site and day: a new one beyond that is not kept.
func (s *Store) AddRejectedHosts(ctx context.Context, rows []RejectedHost, now time.Time) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck // a rollback after a commit has nothing to do
	if _, err := tx.ExecContext(ctx, `DELETE FROM rejected_hosts WHERE day < ?`, now.UTC().AddDate(0, 0, -hostKeepDays).Format(time.DateOnly)); err != nil {
		return err
	}
	for _, r := range rows {
		var have int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM rejected_hosts WHERE site_id = ? AND day = ? AND host = ?`, r.Site, r.Day, r.Host).Scan(&have); err != nil {
			return err
		}
		if have == 0 {
			var n int
			if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM rejected_hosts WHERE site_id = ? AND day = ?`, r.Site, r.Day).Scan(&n); err != nil {
				return err
			}
			if n >= hostsPerDay {
				continue
			}
		}
		// A site that no longer exists has nothing to hang this on: it is dropped.
		if _, err := tx.ExecContext(ctx, `INSERT INTO rejected_hosts (site_id, day, host, n) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM sites WHERE id = ?)
			ON CONFLICT (site_id, day, host) DO UPDATE SET n = n + excluded.n`, r.Site, r.Day, r.Host, r.N, r.Site); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// RejectedHostsOf is what a site was sent from other hostnames in the last
// week: the top five and the count over all of them.
func (s *Store) RejectedHostsOf(ctx context.Context, site string, now time.Time) (RejectedHosts, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT host, sum(n) FROM rejected_hosts WHERE site_id = ? AND day >= ? GROUP BY host`,
		site, now.UTC().AddDate(0, 0, -hostKeepDays+1).Format(time.DateOnly))
	if err != nil {
		return RejectedHosts{}, err
	}
	defer rows.Close()
	out := RejectedHosts{Hosts: []HostCount{}}
	for rows.Next() {
		var h HostCount
		if err := rows.Scan(&h.Host, &h.N); err != nil {
			return RejectedHosts{}, err
		}
		out.Hosts = append(out.Hosts, h)
		out.Total += h.N
	}
	if err := rows.Err(); err != nil {
		return RejectedHosts{}, err
	}
	sort.Slice(out.Hosts, func(i, j int) bool {
		if out.Hosts[i].N != out.Hosts[j].N {
			return out.Hosts[i].N > out.Hosts[j].N
		}
		return out.Hosts[i].Host < out.Hosts[j].Host
	})
	if len(out.Hosts) > hostsShown {
		out.Hosts = out.Hosts[:hostsShown]
	}
	return out, nil
}

// SetupMail is a site with no visit yet that was added at least a wait ago and
// has not had its reminder; its owners' addresses come with it.
type SetupMail struct {
	Site, Domain string
	Owners       []string
}

// SetupMailDue lists the sites due their one reminder email.
func (s *Store) SetupMailDue(ctx context.Context, now time.Time, wait time.Duration) ([]SetupMail, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id, domain, account_id FROM sites WHERE last_event_at = 0 AND setup_mail_at = 0 AND created_at > 0 AND created_at <= ? ORDER BY created_at LIMIT 100`,
		now.Add(-wait).Unix())
	if err != nil {
		return nil, err
	}
	type due struct{ site, domain, account string }
	var list []due
	for rows.Next() {
		var d due
		if err := rows.Scan(&d.site, &d.domain, &d.account); err != nil {
			rows.Close()
			return nil, err
		}
		list = append(list, d)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]SetupMail, 0, len(list))
	for _, d := range list {
		m := SetupMail{Site: d.site, Domain: d.domain}
		owners, err := s.DB.QueryContext(ctx, `SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.account_id = ? AND m.role = ? ORDER BY m.created_at, m.rowid`, d.account, RoleOwner)
		if err != nil {
			return nil, err
		}
		for owners.Next() {
			var e string
			if err := owners.Scan(&e); err != nil {
				owners.Close()
				return nil, err
			}
			m.Owners = append(m.Owners, e)
		}
		owners.Close()
		out = append(out, m)
	}
	return out, nil
}

// MarkSetupMailed records that the reminder went out (or had no one to go to),
// so it is never sent twice.
func (s *Store) MarkSetupMailed(ctx context.Context, site string, at int64) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE sites SET setup_mail_at = ? WHERE id = ? AND setup_mail_at = 0`, at, site)
	return err
}
