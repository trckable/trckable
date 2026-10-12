package api

import (
	"context"

	"github.com/trckable/trckable/server/internal/query"
)

// goalNames are the site's goal names as written, by key. A site without any
// (or an unreadable table) shows its keys.
func (a *API) goalNames(ctx context.Context, site string) query.GoalNames {
	m, err := a.Ctl.GoalLabels(ctx, site)
	if err != nil {
		return nil
	}
	return m
}
