package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/ingest"
)

// FormerHostGrace is how long a site goes on accepting visits from the
// domain it left, so pages still carrying the old address lose nothing.
const FormerHostGrace = 30 * 24 * time.Hour

// ErrSameDomain is a change to the domain the site already has.
var ErrSameDomain = errors.New("that is already this site's address")

// FormerHost is a domain a site left that still counts its visits until
// Until (unix seconds).
type FormerHost struct {
	Host      string `json:"host"`
	Until     int64  `json:"until"`
	ChangedAt int64  `json:"changed_at"`
}

// DomainChange is what a change of domain did.
type DomainChange struct {
	Old   string `json:"old"`
	New   string `json:"new"`
	Until int64  `json:"until"`
}

// ChangeDomain gives a site another domain and nothing else: the id, the
// tracker snippet and every visit stay as they were. In one transaction, so
// the places that follow the domain never disagree:
//   - the old domain is kept as an accepted address for FormerHostGrace;
//   - the name follows when it was the domain;
//   - a note on the chart says when it happened.
//
// The uptime look, the status and share pages, the install check's address
// and the Search Console match all read the domain from sites, so they change
// with it. The same rules as adding a site apply, and the account may not
// already have the new domain.
func (s *Store) ChangeDomain(ctx context.Context, site, domain, author string, now time.Time) (DomainChange, error) {
	var out DomainChange
	domain, err := CleanDomain(domain)
	if err != nil {
		return out, err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return out, err
	}
	defer tx.Rollback()
	var name, zone string
	err = tx.QueryRowContext(ctx, `SELECT domain, name, timezone FROM sites WHERE id = ?`, site).Scan(&out.Old, &name, &zone)
	if errors.Is(err, sql.ErrNoRows) {
		return out, auth.ErrNotFound
	}
	if err != nil {
		return out, err
	}
	if domain == out.Old {
		return out, ErrSameDomain
	}
	out.New, out.Until = domain, now.Add(FormerHostGrace).Unix()
	newName := name
	if name == out.Old || name == "" {
		newName = domain
	}
	if _, err := tx.ExecContext(ctx, `UPDATE sites SET domain = ?, name = ? WHERE id = ?`, domain, newName, site); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return out, ErrExists
		}
		return out, err
	}
	// Going back to a former address ends its waiting; the one just left starts.
	if _, err := tx.ExecContext(ctx, `DELETE FROM site_former_hosts WHERE site_id = ? AND host = ?`, site, domain); err != nil {
		return out, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO site_former_hosts (site_id, host, until, changed_at) VALUES (?, ?, ?, ?)
		ON CONFLICT(site_id, host) DO UPDATE SET until = excluded.until, changed_at = excluded.changed_at`,
		site, out.Old, out.Until, now.Unix()); err != nil {
		return out, err
	}
	// The look at the old address says nothing about the new one.
	if _, err := tx.ExecContext(ctx, `DELETE FROM site_check WHERE site_id = ?`, site); err != nil {
		return out, err
	}
	loc, lerr := time.LoadLocation(zone)
	if lerr != nil {
		loc = time.UTC
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO annotations (id, site_id, day, text, created_at, author_id, planned) VALUES (?, ?, ?, ?, ?, ?, 0)`,
		auth.Token("note_", 8), site, now.In(loc).Format("2006-01-02"), noteText("Domain changed to "+domain), now.Unix(), author); err != nil {
		return out, err
	}
	if err := tx.Commit(); err != nil {
		return out, err
	}
	return out, s.reloadSites(ctx)
}

// FormerHostsOf lists the addresses a site still accepts besides its domain,
// soonest to end first. Ended ones are not listed.
func (s *Store) FormerHostsOf(ctx context.Context, site string, now time.Time) ([]FormerHost, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT host, until, changed_at FROM site_former_hosts WHERE site_id = ? AND until > ? ORDER BY until, host`, site, now.Unix())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FormerHost{} // never null: the dashboard maps over it
	for rows.Next() {
		var f FormerHost
		if err := rows.Scan(&f.Host, &f.Until, &f.ChangedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// EndFormerHost stops accepting visits from a former address now.
func (s *Store) EndFormerHost(ctx context.Context, site, host string) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM site_former_hosts WHERE site_id = ? AND host = ?`, site, strings.ToLower(host))
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return auth.ErrNotFound
	}
	return s.reloadSites(ctx)
}

// loadFormerHosts gives each site its former addresses that have not ended.
func (s *Store) loadFormerHosts(ctx context.Context, sites map[string]ingest.Site) error {
	rows, err := s.DB.QueryContext(ctx, `SELECT site_id, host, until FROM site_former_hosts WHERE until > ?`, time.Now().Unix())
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id, host string
		var until int64
		if err := rows.Scan(&id, &host, &until); err != nil {
			return err
		}
		if site, ok := sites[id]; ok {
			site.Former = append(site.Former, ingest.FormerHost{Host: host, Until: time.Unix(until, 0)})
			sites[id] = site
		}
	}
	return rows.Err()
}

// AccountHasDomain says whether the account has a site with this domain other
// than the one named (empty: any), the check behind "you already have that site".
func (s *Store) AccountHasDomain(ctx context.Context, account, domain, except string) (bool, error) {
	var n int
	err := s.DB.QueryRowContext(ctx, `SELECT count(*) FROM sites WHERE account_id = ? AND domain = ? AND id <> ?`, account, domain, except).Scan(&n)
	return n > 0, err
}
