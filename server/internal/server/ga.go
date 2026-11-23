package server

import (
	"context"
	"errors"

	"github.com/trckable/trckable/server/internal/ga"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/writer"
)

// gaSink stores what an import of Google Analytics brings in: written by the
// writer, the only one allowed to write DuckDB, and read by a report's own
// connection.
type gaSink struct{ s *Server }

var errWarming = errors.New("the analytics store is still warming up")

func (g gaSink) Replace(ctx context.Context, site, from, to string, rows []ga.Row) error {
	w := g.s.writer.Load()
	if w == nil || !w.Ready() {
		return errWarming
	}
	out := make([]writer.ImportedRow, len(rows))
	for i, r := range rows {
		out[i] = writer.ImportedRow{Day: r.Day, Dim: r.Dim, Value: r.Value, Sessions: r.Sessions, Users: r.Users, Views: r.Views}
	}
	err := w.ReplaceImported(ctx, site, from, to, out)
	if g.s.api != nil {
		g.s.api.PurgeSite(site) // the first day of all time may have moved, whoever called
	}
	return err
}

func (g gaSink) Have(ctx context.Context, site, from, to string) (bool, error) {
	st, w := g.s.duck.Load(), g.s.writer.Load()
	if st == nil || w == nil || !w.Ready() {
		return false, errWarming
	}
	return (&query.Q{DB: st.DB}).ImportedHave(ctx, site, from, to)
}
