package query

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/store/duck"
)

func botsRig(t *testing.T) Q {
	t.Helper()
	st, err := duck.Open(context.Background(), filepath.Join(t.TempDir(), "b.duckdb"), duck.Options{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	for _, q := range []string{
		`INSERT INTO bot_daily VALUES ('s1', DATE '2026-09-09', 'bot', 100)`, // the day before
		`INSERT INTO bot_daily VALUES ('s1', DATE '2026-09-10', 'bot', 7)`,
		`INSERT INTO bot_daily VALUES ('s1', DATE '2026-09-10', 'ai-crawler', 3)`,
		`INSERT INTO bot_daily VALUES ('s1', DATE '2026-09-11', 'bot', 5)`,
		`INSERT INTO bot_daily VALUES ('s1', DATE '2026-09-11', 'hosting', 1)`,
		`INSERT INTO bot_daily VALUES ('s1', DATE '2026-09-12', 'headless', 50)`, // the day after
		`INSERT INTO bot_daily VALUES ('s2', DATE '2026-09-10', 'bot', 1000)`,    // another site
	} {
		if _, err := st.DB.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	return Q{DB: st.DB}
}

// The range sum covers the days of the period, per kind, for one site.
func TestBotsSumTheRange(t *testing.T) {
	q := botsRig(t)
	p := Params{Site: "s1", TZ: "UTC",
		From: time.Date(2026, 9, 10, 0, 0, 0, 0, time.UTC), To: time.Date(2026, 9, 12, 0, 0, 0, 0, time.UTC)}
	b, err := q.Bots(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "total", b.Total, int64(16))
	eq(t, "bot", b.Kinds["bot"], int64(12))
	eq(t, "ai-crawler", b.Kinds["ai-crawler"], int64(3))
	eq(t, "hosting", b.Kinds["hosting"], int64(1))
	eq(t, "headless", b.Kinds["headless"], int64(0))
}

// A period in another zone names its days as that zone does.
func TestBotsInTheSitesZone(t *testing.T) {
	q := botsRig(t)
	berlin, _ := time.LoadLocation("Europe/Berlin")
	one := time.Date(2026, 9, 10, 0, 0, 0, 0, berlin)
	p := Params{Site: "s1", TZ: "Europe/Berlin", From: one.UTC(), To: one.AddDate(0, 0, 1).UTC()}
	b, err := q.Bots(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "the 10th", b.Total, int64(10))
}

func TestNoBotsIsZero(t *testing.T) {
	q := botsRig(t)
	p := Params{Site: "none", TZ: "UTC", From: time.Date(2026, 9, 10, 0, 0, 0, 0, time.UTC), To: time.Date(2026, 9, 11, 0, 0, 0, 0, time.UTC)}
	b, err := q.Bots(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "total", b.Total, int64(0))
	if len(b.Kinds) != 0 {
		t.Fatalf("kinds %v", b.Kinds)
	}
}
