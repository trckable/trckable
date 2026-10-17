package sqlite

import (
	"context"
	"database/sql"
	"errors"
)

// Site kinds, as the setup checklist knows them.
const (
	KindShop    = "shop"
	KindSaaS    = "saas"
	KindContent = "content"
	KindOther   = "other"
)

// ValidKind says whether k is one of the four kinds.
func ValidKind(k string) bool {
	return k == KindShop || k == KindSaaS || k == KindContent || k == KindOther
}

// Setup items an owner may say "not for me" to.
var SkippableItems = []string{"payments", "funnel", "search", "crawlers", "proxy"}

// Skip states: skipped is "not for me"; kept is a skip brought back, which
// stops a default from skipping the item again.
const (
	SkipSkipped = "skipped"
	SkipKept    = "kept"
)

// SiteSetup is what the checklist stores for one site.
type SiteSetup struct {
	Kind              string
	KindChosen        bool
	Provider          string
	LocaleConfirmedAt int64
	ProxySeenAt       int64
	FunnelBuiltAt     int64
	PathsSeen         int64
	Skips             map[string]string // item -> skipped | kept
}

// SetupOf reads a site's checklist marks; a site with none has zero values.
func (s *Store) SetupOf(ctx context.Context, site string) (SiteSetup, error) {
	out := SiteSetup{Skips: map[string]string{}}
	var chosen int
	err := s.DB.QueryRowContext(ctx, `SELECT kind, kind_chosen, provider, locale_confirmed_at, proxy_seen_at, funnel_built_at, paths_seen FROM site_setup WHERE site_id = ?`, site).
		Scan(&out.Kind, &chosen, &out.Provider, &out.LocaleConfirmedAt, &out.ProxySeenAt, &out.FunnelBuiltAt, &out.PathsSeen)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return out, err
	}
	out.KindChosen = chosen == 1
	rows, err := s.DB.QueryContext(ctx, `SELECT item, state FROM setup_skips WHERE site_id = ?`, site)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var item, state string
		if err := rows.Scan(&item, &state); err != nil {
			return out, err
		}
		out.Skips[item] = state
	}
	return out, rows.Err()
}

// SetSkip records an item as skipped, or (skipped false) brought back.
func (s *Store) SetSkip(ctx context.Context, site, item string, skipped bool, at int64) error {
	state := SkipKept
	if skipped {
		state = SkipSkipped
	}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO setup_skips (site_id, item, state, at) VALUES (?, ?, ?, ?)
		ON CONFLICT(site_id, item) DO UPDATE SET state = excluded.state, at = excluded.at`, site, item, state, at)
	return err
}

// ConfirmLocale marks the site's time zone and currency as the owner's.
func (s *Store) ConfirmLocale(ctx context.Context, site string, at int64) error {
	_, err := s.DB.ExecContext(ctx, `INSERT INTO site_setup (site_id, locale_confirmed_at) VALUES (?, ?)
		ON CONFLICT(site_id) DO UPDATE SET locale_confirmed_at = excluded.locale_confirmed_at`, site, at)
	return err
}

// MarkFunnelBuilt notes that the owner built a funnel.
func (s *Store) MarkFunnelBuilt(ctx context.Context, site string, at int64) error {
	_, err := s.DB.ExecContext(ctx, `INSERT INTO site_setup (site_id, funnel_built_at) VALUES (?, ?)
		ON CONFLICT(site_id) DO UPDATE SET funnel_built_at = excluded.funnel_built_at`, site, at)
	return err
}

// ChooseKind stores the owner's choice of kind; a later guess never replaces it.
func (s *Store) ChooseKind(ctx context.Context, site, kind string) error {
	_, err := s.DB.ExecContext(ctx, `INSERT INTO site_setup (site_id, kind, kind_chosen) VALUES (?, ?, 1)
		ON CONFLICT(site_id) DO UPDATE SET kind = excluded.kind, kind_chosen = 1`, site, kind)
	return err
}

// GuessKind stores what the install check read from the homepage: the kind
// (unless the owner already chose one) and the payment provider it saw.
func (s *Store) GuessKind(ctx context.Context, site, kind, provider string) error {
	_, err := s.DB.ExecContext(ctx, `INSERT INTO site_setup (site_id, kind, provider) VALUES (?, ?, ?)
		ON CONFLICT(site_id) DO UPDATE SET
			kind = CASE WHEN site_setup.kind_chosen = 0 THEN excluded.kind ELSE site_setup.kind END, provider = excluded.provider`, site, kind, provider)
	return err
}

// SeenProxied records that an event arrived through the site's own-domain
// proxy. Called at most every few minutes per site by the ingest handler.
func (s *Store) SeenProxied(ctx context.Context, site string, at int64) {
	// Best effort, like SeenSite: the next event records it again.
	_, _ = s.DB.ExecContext(ctx, `INSERT INTO site_setup (site_id, proxy_seen_at) VALUES (?, ?)
		ON CONFLICT(site_id) DO UPDATE SET proxy_seen_at = excluded.proxy_seen_at WHERE site_setup.proxy_seen_at < excluded.proxy_seen_at`, site, at)
}

// SetPathsSeen keeps that the site has had pageviews on n distinct paths.
func (s *Store) SetPathsSeen(ctx context.Context, site string, n int64) {
	_, _ = s.DB.ExecContext(ctx, `INSERT INTO site_setup (site_id, paths_seen) VALUES (?, ?)
		ON CONFLICT(site_id) DO UPDATE SET paths_seen = excluded.paths_seen WHERE site_setup.paths_seen < excluded.paths_seen`, site, n)
}
