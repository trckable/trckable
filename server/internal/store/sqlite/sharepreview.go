package sqlite

import (
	"context"
	"encoding/hex"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
)

// A preview is a link made only to be looked at: the owner of a site, building
// a link, sees the shared page itself drawn small, as the options stand. It is
// a share like any other, so what the page shows comes from the same code that
// serves a real link, but it is kept apart: one per person and site, an hour
// long, never listed, never counted against the links a site may have, and
// framed by this origin only.

// PreviewTTL is how long a preview's link opens.
const PreviewTTL = time.Hour

// PreviewSpec is what a preview shows: the options of the link being built.
type PreviewSpec struct {
	Name     string
	Revenue  bool
	Notes    bool
	Live     bool
	Sections []string // nil: all
	Period   string
	// Lock gives it a password nobody knows, so what opens is the password page.
	Lock bool
}

// PreviewShare makes (or makes again) the person's preview link of a site and
// returns its token. The one before it, and every session opened on it, stops
// working at once: the page being drawn is always the last options sent.
func (s *Store) PreviewShare(ctx context.Context, site, person string, spec PreviewSpec, now time.Time) (string, error) {
	if err := CheckSharePeriod(spec.Period); err != nil {
		return "", err
	}
	sections := ShareSections
	if spec.Sections != nil {
		var err error
		if sections, err = ParseSections(spec.Sections); err != nil {
			return "", err
		}
	}
	pass := ""
	if spec.Lock {
		h, err := auth.HashPasswordCtx(ctx, auth.Token("", 16))
		if err != nil {
			return "", err
		}
		pass = h
	}
	id := "shr_pv_" + hex.EncodeToString(auth.Hash(person + "|" + site))[:12]
	token := auth.Token("", 16)
	end := now.Add(PreviewTTL).Unix()
	rev := 0
	if spec.Revenue {
		rev = 1
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback() //nolint:errcheck // a no-op once committed
	if _, err := tx.ExecContext(ctx, `DELETE FROM site_shares WHERE id = ?`, id); err != nil {
		return "", err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO site_shares (id, site_id, name, token_hash, token_enc, pass_hash, revenue, notes, live, expires_at, created_at, embed_origins, sections, period, preview)
		 VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, '', ?, ?, 1)`,
		id, site, strings.TrimSpace(spec.Name), hex.EncodeToString(auth.Hash(token)), pass, rev, spec.Notes, spec.Live, end, now.Unix(), sectionsColumn(sections), spec.Period); err != nil {
		return "", err
	}
	return token, tx.Commit()
}
