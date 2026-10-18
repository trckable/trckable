package api

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/trckable/trckable/server/internal/event"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

func answersOn(g *rig) {
	g.api.AnswerEngines = []string{"openai", "perplexity", "anthropic"}
	g.api.AnswerMax, g.api.AnswerRuns, g.api.AnswerBudget = 3, 2, 20
}

func TestAnswersNeedAnEngine(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	for _, path := range []string{"/answers/setup", "/report/answers?from=2026-09-01&to=2026-09-22"} {
		code, out := do(t, c, "GET", base+path, "")
		if engines, ok := out["engines"].([]any); code != http.StatusOK || !ok || len(engines) != 0 || len(out) != 1 {
			t.Fatalf("%s: %d %v", path, code, out)
		}
	}
	if code, _ := do(t, c, "PUT", base+"/answers/questions", `{"questions":[]}`, csrf, "1"); code != http.StatusBadRequest {
		t.Fatalf("saving with no engine: %d", code)
	}
	if _, me := do(t, c, "GET", g.srv.URL+"/api/v1/me", ""); me["answers"] != false {
		t.Fatalf("me: %v", me["answers"])
	}
}

func TestAnswersQuestionsAreChecked(t *testing.T) {
	g := newRig(t)
	answersOn(g)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	put := func(body string) (int, map[string]any) {
		return do(t, c, "PUT", base+"/answers/questions", body, csrf, "1")
	}
	for name, body := range map[string]string{
		"short":   `{"questions":[{"text":"short","active":true}]}`,
		"names":   `{"questions":[{"text":"is site.com any good for shops","active":true}]}`,
		"twice":   `{"questions":[{"text":"best open analytics","active":true},{"text":"Best  Open analytics","active":true}]}`,
		"many":    `{"questions":[{"text":"question number one"},{"text":"question number two"},{"text":"question number three"},{"text":"question number four"}]}`,
		"toolong": `{"questions":[{"text":"` + strings.Repeat("x", 201) + `"}]}`,
	} {
		code, out := put(body)
		if code != http.StatusBadRequest || out["error"] == nil {
			t.Errorf("%s: %d %v", name, code, out)
		}
	}
	if _, out := put(`{"questions":[{"text":"is site.com any good for shops","active":true}]}`); out["error"] != "A question can't name your site. Ask the way a buyer would, without your name." {
		t.Errorf("the plain message: %v", out["error"])
	}
	var woken int
	g.api.AnswersWake = func(string) { woken++ }
	code, out := put(`{"questions":[{"text":"best open analytics","active":true}]}`)
	if code != http.StatusOK || len(out["questions"].([]any)) != 1 || woken != 1 {
		t.Fatalf("%d %v woken %d", code, out, woken)
	}
	_, setup := do(t, c, "GET", base+"/answers/setup", "")
	if setup["max"] != float64(3) || setup["budget"] == nil || len(setup["engines"].([]any)) != 3 {
		t.Fatalf("%v", setup)
	}
	if code, out := do(t, c, "PUT", base+"/answers/country", `{"country":"de"}`, csrf, "1"); code != 200 || out["country"] != "DE" {
		t.Fatalf("country %d %v", code, out)
	}
	if code, _ := do(t, c, "PUT", base+"/answers/country", `{"country":"Germany"}`, csrf, "1"); code != http.StatusBadRequest {
		t.Fatalf("country %d", code)
	}
	code, out = do(t, c, "PUT", base+"/answers/competitors", `{"competitors":[{"name":"Plausible","domain":"https://www.Plausible.io/x"}]}`, csrf, "1")
	if code != 200 || out["competitors"].([]any)[0].(map[string]any)["domain"] != "plausible.io" {
		t.Fatalf("%d %v", code, out)
	}
	// Ask now: once, then six hours' wait.
	if code, _ := do(t, c, "POST", base+"/answers/run", "", csrf, "1"); code != 200 || woken != 2 {
		t.Fatalf("ask now: %d woken %d", code, woken)
	}
	if code, out := do(t, c, "POST", base+"/answers/run", "", csrf, "1"); code != http.StatusTooManyRequests || out["error"] != "You can ask again in 6 hours." {
		t.Fatalf("second ask: %d %v", code, out)
	}
	// An API key reads; the budget is for those who can change.
	_, k := do(t, c, "POST", g.srv.URL+"/api/v1/keys", `{"name":"ro"}`, csrf, "1")
	key := "Bearer " + k["secret"].(string)
	if code, out := do(t, client(), "GET", base+"/answers/setup", "", "Authorization", key); code != 200 || out["budget"] != nil || len(out["questions"].([]any)) != 1 {
		t.Fatalf("a key reads the set-up without the budget: %d %v", code, out)
	}
}

// A run linking the site's page joins to what AI read, what AI sent and what
// the visitors earned; a subdomain link is cited and adds no page row.
func TestAnswersReportJoinsPages(t *testing.T) {
	g := newRig(t)
	answersOn(g)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	ctx := context.Background()
	do(t, c, "PUT", base+"/answers/competitors", `{"competitors":[{"name":"Plausible","domain":"plausible.io"}]}`, csrf, "1")
	do(t, c, "PUT", base+"/answers/questions", `{"questions":[{"text":"best open analytics","active":true},{"text":"which tool shows sales by source","active":true}]}`, csrf, "1")
	qs, _ := g.ctl.AnswerQuestionsOf(ctx, g.site)

	// The payment connection, as in the revenue test.
	_, conn := do(t, c, "POST", base+"/payments", `{"provider":"stripe"}`, csrf, "1")
	do(t, c, "PATCH", base+"/payments/"+conn["id"].(string), `{"secret":"whsec_e2e"}`, csrf, "1")
	n := uint64(0)
	add := func(e event.Event) {
		n++
		e.EventID, e.Pageview = n, n
		g.event(t, e)
	}
	at := g.now.Add(-time.Hour).UnixMilli()
	add(event.Event{Kind: event.KindPageview, TS: at, Visitor: 0x51, Path: "/compare", Channel: "AI", RefHost: "chatgpt.com"})
	for i := 0; i < 11; i++ { // eleven busier pages push /compare out of the tab's top 10
		for v := 0; v < 3; v++ {
			add(event.Event{Kind: event.KindPageview, TS: at, Visitor: uint64(0x100 + i*10 + v), Path: "/busy" + strconv.Itoa(i), Channel: "AI", RefHost: "claude.ai"})
		}
	}
	for i := 0; i < 5; i++ {
		add(event.Event{Kind: event.KindCrawler, TS: at + int64(i), Path: "/compare", Browser: "OpenAI", OS: "answer"})
	}
	g.waitApplied(t, n)
	body := fmt.Sprintf(`{"id":"evt_x","type":"payment_intent.succeeded","created":%d,"livemode":true,"data":{"object":{"id":"pi_x","amount_received":11900,"currency":"usd","metadata":{"trckable_vid":"%s.abc"}}}}`, g.now.Unix(), strconv.FormatUint(0x51, 36))
	req, _ := http.NewRequest("POST", g.srv.URL+conn["webhook_url"].(string)[strings.Index(conn["webhook_url"].(string), "/webhooks/"):], bytes.NewReader([]byte(body)))
	m := hmac.New(sha256.New, []byte("whsec_e2e"))
	fmt.Fprintf(m, "%d.%s", time.Now().Unix(), body)
	req.Header.Set("Stripe-Signature", fmt.Sprintf("t=%d,v1=%s", time.Now().Unix(), hex.EncodeToString(m.Sum(nil))))
	if res, err := http.DefaultClient.Do(req); err != nil || res.StatusCode != 200 {
		t.Fatalf("webhook: %v %v", res, err)
	} else {
		res.Body.Close()
	}
	if _, err := g.rev.Process(ctx); err != nil {
		t.Fatal(err)
	}

	round := g.now.Add(-time.Hour).Unix()
	save := func(q int64, engine string, run int, text, cites, paths string, rivals ...sqlite.AnswerRival) {
		t.Helper()
		err := g.ctl.SaveAnswerRun(ctx, sqlite.AnswerRun{SiteID: g.site, QuestionID: q, Round: round, Engine: engine, Model: "m", Run: run, AskedAt: round + 5, OK: true,
			Text: text, Citations: cites, CitedPaths: paths, Named: strings.Contains(text, "Site"), Cited: cites != "[]", Position: 1, Rivals: rivals}, "2026-09")
		if err != nil {
			t.Fatal(err)
		}
	}
	save(qs[0].ID, "openai", 1, "Site and Plausible.", `[{"url":"https://www.site.com/compare?utm_source=openai","title":"Compare"}]`, `["/compare"]`,
		sqlite.AnswerRival{Name: "Plausible", Named: true, Position: 2})
	save(qs[0].ID, "perplexity", 1, "Only others.", `[{"url":"https://docs.site.com/x","title":"Docs"}]`, `[]`)
	save(qs[1].ID, "openai", 1, "Nobody.", `[]`, `[]`)

	period := "?from=2026-09-15&to=2026-09-22"
	code, out := do(t, c, "GET", base+"/report/answers"+period, "")
	if code != 200 {
		t.Fatalf("%d %v", code, out)
	}
	pages := out["pages"].([]any)
	if len(pages) != 1 {
		t.Fatalf("one page row (a subdomain adds none): %v", pages)
	}
	pg := pages[0].(map[string]any)
	if pg["path"] != "/compare" || pg["answers"] != float64(1) || pg["read"] != float64(5) || pg["sent"] != float64(1) || pg["revenue"] != float64(11900) {
		t.Fatalf("/compare: %v", pg)
	}
	latest := out["latest"].(map[string]any)
	if latest["seen"] != float64(2) || latest["total"] != float64(3) || latest["complete"] != true || out["was"] != nil {
		t.Fatalf("latest: %v", latest)
	}
	q0 := out["questions"].([]any)[0].(map[string]any)
	if q0["state"] != "both" && q0["state"] != "named" || q0["engines"].(map[string]any)["perplexity"].(map[string]any)["cited"] != float64(1) {
		t.Fatalf("question: %v", q0)
	}
	if ins := q0["instead"].([]any); len(ins) != 1 || ins[0] != "Plausible" {
		t.Fatalf("instead: %v", ins)
	}
	if r := out["rivals"].([]any)[0].(map[string]any); r["name"] != "Plausible" || r["seen"] != float64(1) || r["total"] != float64(3) {
		t.Fatalf("rivals: %v", r)
	}

	// The detail of one question carries the sentence and the citations.
	_, d := do(t, c, "GET", fmt.Sprintf("%s/answers/questions/%d", base, qs[0].ID), "")
	runs := d["rounds"].([]any)[0].(map[string]any)["engines"].(map[string]any)["openai"].([]any)
	if len(runs) != 1 || runs[0].(map[string]any)["sentence"] == "" {
		t.Fatalf("detail: %v", d)
	}
	if code, _ := do(t, c, "GET", base+"/answers/questions/99999", ""); code != http.StatusNotFound {
		t.Fatalf("unknown question: %d", code)
	}

	// With the analytics store not ready, the report still answers, without the join.
	g.api.Query = func() *query.Q { return nil }
	code, out = do(t, c, "GET", base+"/report/answers"+period, "")
	pg = out["pages"].([]any)[0].(map[string]any)
	if code != 200 || pg["read"] != nil || pg["revenue"] != nil || pg["answers"] != float64(1) {
		t.Fatalf("no analytics: %d %v", code, pg)
	}
}

func TestAnswersSetupItemAndMoments(t *testing.T) {
	g := newRig(t)
	c := client()
	g.setup(t, c)
	base := g.srv.URL + "/api/v1/sites/" + g.site
	has := func() (found, done bool) {
		_, out := do(t, c, "GET", base+"/setup", "")
		for _, it := range out["items"].([]any) {
			if m := it.(map[string]any); m["id"] == "answers" {
				return true, m["done"] == true
			}
		}
		return false, false
	}
	if found, _ := has(); found {
		t.Fatal("the item is there with no engine")
	}
	answersOn(g)
	if found, done := has(); !found || done {
		t.Fatalf("found %v done %v", found, done)
	}
	do(t, c, "PUT", base+"/answers/questions", `{"questions":[{"text":"best open analytics","active":true}]}`, csrf, "1")
	if _, done := has(); !done {
		t.Fatal("a question should tick it")
	}
	qs, _ := g.ctl.AnswerQuestionsOf(context.Background(), g.site)
	round := g.now.Add(-2 * time.Hour).Unix()
	_ = g.ctl.SaveAnswerRun(context.Background(), sqlite.AnswerRun{SiteID: g.site, QuestionID: qs[0].ID, Round: round, Engine: "openai", Model: "m", Run: 1, AskedAt: round, OK: true, Named: true, Position: 1}, "2026-09")
	if _, err := g.ctl.FinishAnswerRound(context.Background(), g.site, round, round+604800, round); err != nil {
		t.Fatal(err)
	}
	_, out := do(t, c, "GET", base+"/moments?from=2026-09-22&to=2026-09-22&bucket=hour", "")
	var found bool
	for _, m := range out["moments"].([]any) {
		if mm := m.(map[string]any); mm["kind"] == "answer" && mm["bot"] == "openai" && mm["what"] == "seen" && mm["first_ever"] == true && mm["question"] == float64(qs[0].ID) {
			found = true
		}
	}
	if !found {
		t.Fatalf("no answer moment: %v", out["moments"])
	}
}
