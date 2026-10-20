package channels

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/secrets"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// Codes a pull leaves on an account; the dashboard turns them into words.
const (
	CodeDenied  = "denied"  // the platform refused the token: connect again
	CodeExpired = "expired" // not refreshed in time, so the data was deleted
	CodeLimited = "limited" // the platform's rate limit: the next round tries again
	CodeFailed  = "failed"
)

// Manager connects accounts and pulls their views.
type Manager struct {
	Store      *sqlite.Store
	Box        *secrets.Box
	Connectors map[string]Connector
	Now        func() time.Time

	mu   sync.Mutex // one pull at a time: the volume is a few calls per account
	soon sync.WaitGroup
}

// New returns a manager for the connectors that have their app keys.
func New(st *sqlite.Store, box *secrets.Box, cs ...Connector) *Manager {
	m := &Manager{Store: st, Box: box, Connectors: map[string]Connector{}, Now: time.Now}
	for _, c := range cs {
		m.Connectors[c.Platform()] = c
	}
	return m
}

// Connector returns a platform's connector when its keys are set.
func (m *Manager) Connector(platform string) (Connector, bool) {
	if m == nil {
		return nil, false
	}
	c, ok := m.Connectors[platform]
	return c, ok && c.Configured()
}

func sealCtx(id string) string { return "social " + id }

func (m *Manager) seal(id string, t Token) (access, refresh string, err error) {
	if access, err = m.Box.SealFor(t.Access.Reveal(), sealCtx(id)); err != nil {
		return "", "", err
	}
	refresh, err = m.Box.SealFor(t.Refresh.Reveal(), sealCtx(id))
	return access, refresh, err
}

func (m *Manager) open(a sqlite.SocialAccount) (Token, error) {
	acc, err := m.Box.OpenFor(a.AccessEnc, sealCtx(a.ID))
	if err != nil || acc == "" {
		return Token{}, ErrDenied
	}
	ref, _ := m.Box.OpenFor(a.RefreshEnc, sealCtx(a.ID))
	return Token{Access: secrets.NewSecret(acc), Refresh: secrets.NewSecret(ref), Expires: time.Unix(a.Expires, 0)}, nil
}

// Connect keeps a signed-in account for the team: a new row, or the tokens of
// the one already there. It returns the account.
func (m *Manager) Connect(ctx context.Context, team, platform string, t Token, who Identity) (sqlite.SocialAccount, error) {
	id, ok := m.Store.SocialIDOf(ctx, team, platform, who.ID)
	if !ok {
		id = auth.Token("", 12)
	}
	access, refresh, err := m.seal(id, t)
	if err != nil {
		return sqlite.SocialAccount{}, err
	}
	a := sqlite.SocialAccount{ID: id, AccountID: team, Platform: platform, ExternalID: who.ID, AppUserID: who.AppID, Handle: who.Handle, AccessEnc: access, RefreshEnc: refresh, Expires: t.Expires.Unix()}
	if err := m.Store.SocialSave(ctx, a); err != nil {
		return a, err
	}
	return m.Store.SocialAccountOf(ctx, team, id)
}

// Disconnect removes an account: the platform's grant when it can be, then the
// tokens and every day the account holds.
func (m *Manager) Disconnect(ctx context.Context, team, id string) (bool, error) {
	a, err := m.Store.SocialAccountOf(ctx, team, id)
	if errors.Is(err, auth.ErrNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if c, ok := m.Connectors[a.Platform]; ok {
		if t, err := m.open(a); err == nil {
			c.Revoke(ctx, t)
		}
	}
	return m.Store.SocialDelete(ctx, team, id)
}

// Deauth handles a platform telling us a person removed the app or asked for
// their data to be deleted. signed is the platform's signed request.
func (m *Manager) Deauth(ctx context.Context, platform, signed string) error {
	c, ok := m.Connectors[platform]
	d, can := c.(interface{ Deauth(string) (string, error) })
	if !ok || !can {
		return ErrBadSignedRequest
	}
	who, err := d.Deauth(signed)
	if err != nil {
		return err
	}
	_, err = m.Store.SocialDeleteExternal(ctx, platform, who)
	return err
}

// Soon pulls a just-connected account in the background, so its card fills
// without waiting for the next round.
func (m *Manager) Soon(a sqlite.SocialAccount) {
	m.soon.Add(1)
	go func() {
		defer m.soon.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()
		_ = m.Pull(ctx, a)
	}()
}

// Wait returns when every pull started by Soon has ended.
func (m *Manager) Wait() { m.soon.Wait() }

// CoverFrom is the first day an account's numbers can reach: where its first
// pull began. A period starting earlier is only partly counted.
func (m *Manager) CoverFrom(a sqlite.SocialAccount) string {
	back := 7
	if m != nil {
		if c, ok := m.Connectors[a.Platform]; ok {
			back = c.Backfill()
		}
	}
	return day(time.Unix(a.Created, 0).AddDate(0, 0, -back))
}

// Pull reads an account's recent days and keeps them. The first pull reaches
// back as far as the platform allows; later ones re-read the last week, which
// is where the platforms still revise their numbers.
func (m *Manager) Pull(ctx context.Context, a sqlite.SocialAccount) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.pull(ctx, a)
}

func (m *Manager) pull(ctx context.Context, a sqlite.SocialAccount) error {
	c, ok := m.Connectors[a.Platform]
	if !ok || !c.Configured() {
		return nil
	}
	now := m.Now()
	t, err := m.open(a)
	if err != nil {
		return m.fail(ctx, a, ErrDenied)
	}
	if left := t.Expires.Sub(now); left < max(c.RefreshBefore(), time.Minute) {
		if nt, err := c.Refresh(ctx, t); err != nil {
			// A token that still works carries on to the next round; one
			// that ended, or was refused, is the person's to connect again.
			if left <= 0 || errors.Is(err, ErrDenied) {
				return m.fail(ctx, a, err)
			}
		} else {
			t = nt
			access, refresh, err := m.seal(a.ID, t)
			if err == nil {
				err = m.Store.SocialSetTokens(ctx, a.ID, access, refresh, t.Expires.Unix())
			}
			if err != nil {
				return err
			}
		}
	}
	// A platform that makes us refresh or delete (YouTube) is read over its whole
	// kept window every round, so nothing kept is older than its last refresh.
	back := 7
	if a.LastOK == 0 || c.MaxStale() > 0 {
		back = c.Backfill()
	}
	from, to := day(now.AddDate(0, 0, -back)), day(now.AddDate(0, 0, -1))
	days, err := c.Daily(ctx, t, Identity{ID: a.ExternalID, Handle: a.Handle}, from, to)
	if len(days) > 0 {
		if serr := m.Store.SocialSaveDays(ctx, a.ID, a.Platform, days); serr != nil {
			return serr
		}
	}
	if err != nil {
		return m.fail(ctx, a, err)
	}
	if c.MaxStale() > 0 {
		if err := m.Store.SocialPruneBefore(ctx, a.ID, from); err != nil {
			return err
		}
	}
	return m.Store.SocialStatus(ctx, a.ID, "")
}

// fail leaves a code on the account and reports why, without a token or the
// platform's own words.
func (m *Manager) fail(ctx context.Context, a sqlite.SocialAccount, err error) error {
	var lim *LimitError
	code := CodeFailed
	switch {
	case errors.Is(err, ErrDenied):
		code = CodeDenied
	case errors.As(err, &lim):
		code = CodeLimited
	}
	slog.Warn("channels: a pull did not finish", "platform", a.Platform, "account", a.ID, "code", code, "err", err)
	if serr := m.Store.SocialStatus(ctx, a.ID, code); serr != nil {
		return serr
	}
	return err
}

// Round pulls every account once. Before that, data a platform requires to be
// refreshed in time and was not is deleted.
func (m *Manager) Round(ctx context.Context) {
	all, err := m.Store.SocialAccountsAll(ctx)
	if err != nil {
		slog.Warn("channels: could not list the accounts", "err", err)
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, a := range all {
		if ctx.Err() != nil {
			return
		}
		c, ok := m.Connectors[a.Platform]
		if !ok {
			continue
		}
		if m.stale(a, c) {
			if err := m.Store.SocialForget(ctx, a.ID, CodeExpired); err != nil {
				slog.Warn("channels: could not delete stale data", "platform", a.Platform, "account", a.ID, "err", err)
			}
			continue
		}
		if a.AccessEnc == "" {
			continue // nothing to read with until the person connects again
		}
		_ = m.pull(ctx, a)
	}
}

// stale says whether an account's data has gone unrefreshed for longer than
// its platform allows.
func (m *Manager) stale(a sqlite.SocialAccount, c Connector) bool {
	limit := c.MaxStale()
	if limit <= 0 || a.AccessEnc == "" {
		return false
	}
	last := a.LastOK
	if last == 0 {
		last = a.Created
	}
	return m.Now().Sub(time.Unix(last, 0)) > limit
}

// Run pulls every account a little after the start and then every period.
func (m *Manager) Run(ctx context.Context, every time.Duration) {
	if every <= 0 {
		return
	}
	wait := func(d time.Duration) bool {
		t := time.NewTimer(d)
		defer t.Stop()
		select {
		case <-ctx.Done():
			return false
		case <-t.C:
			return true
		}
	}
	if !wait(2 * time.Minute) {
		return
	}
	for {
		m.Round(ctx)
		if !wait(every) {
			return
		}
	}
}
