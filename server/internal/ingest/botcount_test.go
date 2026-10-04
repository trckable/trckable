package ingest

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

func counts(rows []BotCount) map[string]uint64 {
	m := map[string]uint64{}
	for _, r := range rows {
		m[r.Site+" "+r.Day+" "+r.Kind] = r.N
	}
	return m
}

func TestBotsAreCountedByKind(t *testing.T) {
	h, _ := newHandler(t)
	for _, ua := range []string{
		"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
		"curl/8.4.0",
		"",
		"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2)",
		"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ClaudeBot/1.0",
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36",
	} {
		post(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/"}`, ua)
	}
	got := counts(h.Bots.Drain())
	want := map[string]uint64{
		"tkb_test 2026-09-22 bot":        3,
		"tkb_test 2026-09-22 ai-crawler": 2,
		"tkb_test 2026-09-22 headless":   1,
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("counted %v, want %v", got, want)
	}
	if h.Stats.Bots.Load() != 6 {
		t.Fatalf("the running total moved: %d", h.Stats.Bots.Load())
	}
}

func TestBotCountsLeaveOutWhatIsNotABot(t *testing.T) {
	h, l := newHandler(t)
	h.Sites = fakeSites{"tkb_test": {ID: "tkb_test", Domain: "site.com", ExcludePaths: []string{"/admin/*"}, HonorDNT: true}}
	bot := "curl/8.4.0"
	// A site nobody registered, a page from another site, a bad payload.
	post(h, `{"s":"tkb_nope","k":"pv","u":"https://site.com/"}`, bot)
	post(h, `{"s":"tkb_test","k":"pv","u":"https://evil.com/"}`, bot)
	post(h, `{"s":"tkb_test","k":"zz"`, bot)
	// The owner's own choices: an excluded path, a browser that asked not to be followed.
	post(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/admin/users"}`, chromeUA)
	req := httptest.NewRequest(http.MethodPost, "/api/e", strings.NewReader(`{"s":"tkb_test","k":"pv","u":"https://site.com/"}`))
	req.Header.Set("User-Agent", chromeUA)
	req.Header.Set("DNT", "1")
	h.ServeHTTP(httptest.NewRecorder(), req)
	// A real visit.
	post(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/","id":"a"}`, chromeUA)
	if rows := h.Bots.Drain(); len(rows) != 0 {
		t.Fatalf("counted what is not a bot: %v", rows)
	}
	if n, _ := l.Committed(); n != 1 {
		t.Fatalf("the real visit was not kept: %d", n)
	}
}

func TestStrictFilteringCountsHosting(t *testing.T) {
	h, _ := newHandler(t)
	h.Sites = fakeSites{"tkb_test": {ID: "tkb_test", Domain: "site.com", BotStrict: true}}
	h.Hosting = func(string) bool { return true }
	post(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/"}`, chromeUA) // from a data centre
	h.Hosting = func(string) bool { return false }
	post(h, `{"s":"tkb_test","k":"pv","u":"https://site.com/","id":"a"}`, chromeUA) // a visitor at home: kept
	got := counts(h.Bots.Drain())
	want := map[string]uint64{"tkb_test 2026-09-22 hosting": 1}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("counted %v, want %v", got, want)
	}
}

func TestBotDaysAreUTC(t *testing.T) {
	var b BotCounts
	late := time.Date(2026, 9, 22, 23, 59, 0, 0, time.FixedZone("west", -5*3600)) // already the 23rd in UTC
	b.Add("s", late, BotOther)
	b.Add("s", late.Add(2*time.Minute), BotOther)
	got := counts(b.Drain())
	if !reflect.DeepEqual(got, map[string]uint64{"s 2026-09-23 bot": 2}) {
		t.Fatalf("got %v", got)
	}
}

// What is drained is handed over once; a failed write gives it back, and the
// sum is the same as if nothing had gone wrong.
func TestDrainHandsEachCountOverOnce(t *testing.T) {
	var b BotCounts
	at := time.Date(2026, 9, 22, 12, 0, 0, 0, time.UTC)
	b.Add("s", at, BotOther)
	b.Add("s", at, BotOther)
	first := b.Drain()
	if again := b.Drain(); len(again) != 0 {
		t.Fatalf("drained twice: %v", again)
	}
	b.Add("s", at, BotOther) // arrives while the write is failing
	b.Restore(first)
	got := counts(b.Drain())
	if !reflect.DeepEqual(got, map[string]uint64{"s 2026-09-22 bot": 3}) {
		t.Fatalf("after a restore: %v", got)
	}
}

func TestBotCountsAreSafeUnderLoad(t *testing.T) {
	var b BotCounts
	at := time.Date(2026, 9, 22, 12, 0, 0, 0, time.UTC)
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 500; j++ {
				b.Add("s", at, BotOther)
			}
		}()
	}
	var total uint64
	for i := 0; i < 20; i++ {
		for _, r := range b.Drain() {
			total += r.N
		}
	}
	wg.Wait()
	for _, r := range b.Drain() {
		total += r.N
	}
	if total != 4000 {
		t.Fatalf("counted %d of 4000", total)
	}
}
