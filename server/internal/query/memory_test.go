package query

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/duck"
)

// A big site's deep 30-day report must fit a small memory limit: the
// breakdowns have to stream or spill, never fail with an out-of-memory error.
func TestReportFitsSmallMemoryLimit(t *testing.T) {
	ctx := context.Background()
	st, err := duck.Open(ctx, filepath.Join(t.TempDir(), "m.duckdb"), duck.Options{MemoryLimit: "96MB"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	// 600k sessions with many distinct visitors, pages, referrers and cities.
	if _, err := st.DB.ExecContext(ctx, `INSERT INTO sessions
		SELECT 's1', i, i, TIMESTAMP '2026-09-01' + to_seconds(i % 2500000), TIMESTAMP '2026-09-01' + to_seconds(i % 2500000 + 60),
		       TIMESTAMP '2026-01-01', 'Search', 'ref' || (i % 40000) || '.example.com', '/p/' || (i % 90000), '/x/' || (i % 90000),
		       'c' || (i % 500), 's' || (i % 300), 'm' || (i % 20), 'C' || (i % 200), 'R' || (i % 3000), 'City' || (i % 30000),
		       'Desktop', 'B' || (i % 40), 'OS' || (i % 30), 'l' || (i % 80), 3, 0, 1000, 60.0, 'v' || (i % 300), (300 + i % 2000)::USMALLINT
		FROM range(600000) t(i)`); err != nil {
		t.Fatal(err)
	}
	q := Q{DB: st.DB}
	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	res, err := q.Report(ctx, Params{Site: "s1", From: from, To: from.AddDate(0, 0, 30), TZ: "UTC", Bucket: "day", Limit: 10, Daily: true, Deep: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Dims["referrer"]) == 0 || len(res.Dims["city"]) == 0 {
		t.Fatalf("empty breakdowns: %d referrers, %d cities", len(res.Dims["referrer"]), len(res.Dims["city"]))
	}
}
