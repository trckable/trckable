package writer

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/trckable/trckable/server/internal/event"
)

// A page's title is kept once per (site, path), the latest one a pageview
// carried, in the page_titles table: never on the event rows, so a busy page
// costs no more to store than a quiet one. Within a batch the newest view
// wins; across batches a view that happened earlier than the stored one does
// not replace it, and a view held back by an outage is not used at all.

type titleKey struct{ site, path string }

type titleVal struct {
	title string
	ts    int64 // unix ms of the view that carried it
}

// maxTitleCache bounds the memory of titles already written; when it is
// full it starts over, and the next views write their titles once more.
const maxTitleCache = 50000

// titlesOf is the latest title of every page the rows carry one for.
func titlesOf(rows []row) map[titleKey]titleVal {
	out := map[titleKey]titleVal{}
	for i := range rows {
		e := &rows[i].e
		// A view held back by an outage may name an older title than the one
		// stored; the next view of the page says what it is called now.
		if e.Kind != event.KindPageview || e.Title == "" || e.Path == "" || e.Late {
			continue
		}
		k := titleKey{e.Site, e.Path}
		if cur, ok := out[k]; !ok || e.TS >= cur.ts {
			out[k] = titleVal{e.Title, e.TS}
		}
	}
	return out
}

// saveTitles writes the titles that differ from the ones this writer wrote
// last, inside the batch's transaction, and returns what to remember once the
// transaction has committed.
func (w *Writer) saveTitles(ctx context.Context, conn *sql.Conn, rows []row) (map[titleKey]titleVal, error) {
	all := titlesOf(rows)
	todo := make([]titleKey, 0, len(all))
	for k, v := range all {
		if have, ok := w.titles[k]; !ok || (have.title != v.title && v.ts >= have.ts) {
			todo = append(todo, k)
		}
	}
	const batch = 200 // rows per statement: a statement per row is slow in DuckDB
	for lo := 0; lo < len(todo); lo += batch {
		part := todo[lo:min(lo+batch, len(todo))]
		marks := strings.TrimSuffix(strings.Repeat("(?, ?, ?, make_timestamp(?)),", len(part)), ",")
		args := make([]any, 0, 4*len(part))
		for _, k := range part {
			args = append(args, k.site, k.path, all[k].title, all[k].ts*1000) // DuckDB counts microseconds
		}
		if _, err := conn.ExecContext(ctx, `INSERT INTO page_titles (site_id, path, title, seen) VALUES `+marks+ //nolint:gosec // only placeholders are built; the values are bound
			` ON CONFLICT (site_id, path) DO UPDATE SET title = excluded.title, seen = excluded.seen WHERE excluded.seen >= page_titles.seen`, args...); err != nil {
			return nil, fmt.Errorf("page titles: %w", err)
		}
	}
	written := make(map[titleKey]titleVal, len(todo))
	for _, k := range todo {
		written[k] = all[k]
	}
	return written, nil
}

// rememberTitles notes what a committed batch wrote.
func (w *Writer) rememberTitles(written map[titleKey]titleVal) {
	if len(written) == 0 {
		return
	}
	if w.titles == nil || len(w.titles)+len(written) > maxTitleCache {
		w.titles = make(map[titleKey]titleVal, len(written))
	}
	for k, v := range written {
		w.titles[k] = v
	}
}
