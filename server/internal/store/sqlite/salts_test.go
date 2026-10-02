package sqlite

import (
	"testing"
	"time"
)

// Only today's and yesterday's salts stay on disk; asking for today's salt
// deletes anything older.
func TestOnlyTodayAndYesterdaySaltsAreKept(t *testing.T) {
	s := openT(t)
	now := time.Now().UTC()
	day := func(back int) string { return now.AddDate(0, 0, -back).Format("2006-01-02") }
	for _, d := range []string{day(5), day(3), day(2), day(1)} {
		if _, err := s.DB.Exec(`INSERT INTO daily_salts (day, salt) VALUES (?, ?)`, d, []byte("old")); err != nil {
			t.Fatal(err)
		}
	}
	got, err := s.DailySalt(day(0), []byte("fresh"))
	if err != nil || string(got) != "fresh" {
		t.Fatalf("today's salt: %q, %v", got, err)
	}
	rows, err := s.DB.Query(`SELECT day FROM daily_salts ORDER BY day`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var kept []string
	for rows.Next() {
		var d string
		if err := rows.Scan(&d); err != nil {
			t.Fatal(err)
		}
		kept = append(kept, d)
	}
	if len(kept) != 2 || kept[0] != day(1) || kept[1] != day(0) {
		t.Fatalf("kept %v, want [%s %s]", kept, day(1), day(0))
	}
	// The first salt of a day still wins.
	if again, _ := s.DailySalt(day(0), []byte("other")); string(again) != "fresh" {
		t.Fatalf("a second ask changed today's salt: %q", again)
	}
}
