package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// SiteLayout is how an account's site switcher is arranged: the sites in
// the order people dragged them, the pinned ones on top, and named groups
// ("Clients", "Shops") holding some of them. A site in no group sits in the
// plain list. One per account, so a whole team sees the same switcher and
// the same All sites page.
type SiteLayout struct {
	// Order is every arranged site, first to last. Sites missing from it
	// (added since) follow in the order they were made.
	Order  []string    `json:"order"`
	Pinned []string    `json:"pinned"`
	Groups []SiteGroup `json:"groups"`
}

// SiteGroup is one named group and its sites, in order.
type SiteGroup struct {
	Name  string   `json:"name"`
	Sites []string `json:"sites"`
}

// Limits for a layout: generous for anyone, small enough that no request
// can make the row large.
const (
	MaxSiteGroups    = 50
	MaxSiteGroupName = 40
)

// ErrLayout is a layout that names a site this account does not have, or
// breaks a limit. The message says which.
type ErrLayout struct{ Why string }

func (e ErrLayout) Error() string { return e.Why }

// cleanLayout checks a layout against the account's sites and returns it
// tidied: names trimmed, nothing twice. A site that is not the account's is
// refused, the same for one in another account and one that never existed,
// so the answer says nothing about other accounts.
func cleanLayout(in SiteLayout, sites []SiteRow) (SiteLayout, error) {
	have := make(map[string]bool, len(sites))
	for _, s := range sites {
		have[s.ID] = true
	}
	ids := func(list []string, what string) ([]string, error) {
		out := []string{}
		seen := map[string]bool{}
		for _, id := range list {
			if !have[id] {
				return nil, ErrLayout{fmt.Sprintf("%s names a site this account does not have", what)}
			}
			if !seen[id] {
				seen[id] = true
				out = append(out, id)
			}
		}
		return out, nil
	}
	var out SiteLayout
	var err error
	if out.Order, err = ids(in.Order, "order"); err != nil {
		return SiteLayout{}, err
	}
	if out.Pinned, err = ids(in.Pinned, "pinned"); err != nil {
		return SiteLayout{}, err
	}
	if len(in.Groups) > MaxSiteGroups {
		return SiteLayout{}, ErrLayout{fmt.Sprintf("%d groups at most", MaxSiteGroups)}
	}
	out.Groups = []SiteGroup{}
	names := map[string]bool{}
	grouped := map[string]bool{}
	for _, g := range in.Groups {
		name := strings.TrimSpace(g.Name)
		if name == "" || len([]rune(name)) > MaxSiteGroupName {
			return SiteLayout{}, ErrLayout{fmt.Sprintf("a group needs a name of 1 to %d characters", MaxSiteGroupName)}
		}
		if names[strings.ToLower(name)] {
			return SiteLayout{}, ErrLayout{fmt.Sprintf("there is already a group called %q", name)}
		}
		names[strings.ToLower(name)] = true
		list, err := ids(g.Sites, "a group")
		if err != nil {
			return SiteLayout{}, err
		}
		for _, id := range list {
			if grouped[id] {
				return SiteLayout{}, ErrLayout{"a site can be in one group only"}
			}
			grouped[id] = true
		}
		out.Groups = append(out.Groups, SiteGroup{Name: name, Sites: list})
	}
	return out, nil
}

// forget drops the sites that are gone (deleted since the layout was saved).
func (l SiteLayout) forget(have map[string]bool) SiteLayout {
	keep := func(list []string) []string {
		out := []string{}
		for _, id := range list {
			if have[id] {
				out = append(out, id)
			}
		}
		return out
	}
	out := SiteLayout{Order: keep(l.Order), Pinned: keep(l.Pinned), Groups: []SiteGroup{}}
	for _, g := range l.Groups {
		out.Groups = append(out.Groups, SiteGroup{Name: g.Name, Sites: keep(g.Sites)})
	}
	return out
}

// SiteLayoutOf reads an account's layout. An account that never arranged
// its sites gets an empty one: the sites in the order they were made.
func (s *Store) SiteLayoutOf(ctx context.Context, account string) (SiteLayout, error) {
	empty := SiteLayout{Order: []string{}, Pinned: []string{}, Groups: []SiteGroup{}}
	var raw string
	err := s.DB.QueryRowContext(ctx, `SELECT layout FROM site_layout WHERE account_id = ?`, account).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return empty, nil
	}
	if err != nil {
		return SiteLayout{}, err
	}
	var l SiteLayout
	if err := json.Unmarshal([]byte(raw), &l); err != nil {
		return empty, nil //nolint:nilerr // a row this code did not write reads as no layout, never as a broken switcher
	}
	sites, err := s.ListSites(ctx, account)
	if err != nil {
		return SiteLayout{}, err
	}
	have := make(map[string]bool, len(sites))
	for _, si := range sites {
		have[si.ID] = true
	}
	return l.forget(have), nil
}

// SetSiteLayout checks a layout against the account's sites and saves it.
func (s *Store) SetSiteLayout(ctx context.Context, account string, in SiteLayout) (SiteLayout, error) {
	sites, err := s.ListSites(ctx, account)
	if err != nil {
		return SiteLayout{}, err
	}
	l, err := cleanLayout(in, sites)
	if err != nil {
		return SiteLayout{}, err
	}
	raw, err := json.Marshal(l)
	if err != nil {
		return SiteLayout{}, err
	}
	_, err = s.DB.ExecContext(ctx,
		`INSERT INTO site_layout (account_id, layout, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(account_id) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at`,
		account, string(raw), time.Now().Unix())
	return l, err
}

// Only is the layout as someone limited to the sites in have sees it: the
// other sites gone, and a group left with none of theirs gone too, name and
// all (a group's name can say what the hidden sites are).
func (l SiteLayout) Only(have map[string]bool) SiteLayout {
	out := l.forget(have)
	groups := []SiteGroup{}
	for _, g := range out.Groups {
		if len(g.Sites) > 0 {
			groups = append(groups, g)
		}
	}
	out.Groups = groups
	return out
}
