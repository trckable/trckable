package answers

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
)

type fake struct {
	status int
	files  []string // one per call
	calls  [][]byte
}

func (f *fake) Do(r *http.Request) (*http.Response, error) {
	b, _ := io.ReadAll(r.Body)
	f.calls = append(f.calls, b)
	i := min(len(f.calls)-1, len(f.files)-1)
	body, _ := os.ReadFile("testdata/" + f.files[i])
	st := f.status
	if st == 0 {
		st = 200
	}
	return &http.Response{StatusCode: st, Body: io.NopCloser(bytes.NewReader(body)), Header: http.Header{}}, nil
}

func ask(t *testing.T, a Asker, country string) (Answer, error) {
	t.Helper()
	return a.Ask(context.Background(), Request{Question: "best analytics", Country: country})
}

func TestOpenAI(t *testing.T) {
	f := &fake{files: []string{"openai_ok.json"}}
	a, err := ask(t, NewOpenAI(f, "sk-test", ""), "de")
	if err != nil {
		t.Fatal(err)
	}
	if len(a.Citations) != 2 || a.Citations[0].URL != "https://example.com/compare?utm_source=openai" || len(a.Sources) != 2 {
		t.Errorf("citations %v sources %v", a.Citations, a.Sources)
	}
	if a.Usage.Searches != 1 || a.Usage.InputTokens != 1000 || a.Model != "gpt-4.1-mini-2025" {
		t.Errorf("%+v", a)
	}
	sent := string(f.calls[0])
	for _, want := range []string{`"store":false`, `"country":"DE"`, `web_search_call.action.sources`, `"input":"best analytics"`} {
		if !strings.Contains(sent, want) {
			t.Errorf("request lacks %s: %s", want, sent)
		}
	}
	// Nothing but the question: no system prompt, no site.
	if strings.Contains(sent, "system") || strings.Contains(sent, "instructions") {
		t.Errorf("request carries more than the question: %s", sent)
	}
	n, _ := ask(t, NewOpenAI(&fake{files: []string{"openai_nocite.json"}}, "k", ""), "")
	if n.Text != "Many tools exist." || len(n.Citations) != 0 {
		t.Errorf("%+v", n)
	}
}

func TestNoCountryNoLocation(t *testing.T) {
	f := &fake{files: []string{"openai_ok.json"}}
	_, _ = ask(t, NewOpenAI(f, "k", ""), "")
	if strings.Contains(string(f.calls[0]), "user_location") {
		t.Error("a location was sent without a country")
	}
}

func TestKeyErrorHoldsNoBody(t *testing.T) {
	for name, a := range map[string]func(*fake) Asker{
		"openai":    func(f *fake) Asker { return NewOpenAI(f, "k", "") },
		"anthropic": func(f *fake) Asker { return NewAnthropic(f, "k", "") },
		"pplx":      func(f *fake) Asker { return NewPerplexity(f, "k", "") },
	} {
		_, err := ask(t, a(&fake{status: 401, files: []string{"openai_401.json"}}), "")
		if !errors.Is(err, ErrKey) {
			t.Errorf("%s: %v", name, err)
		}
		if err != nil && (strings.Contains(err.Error(), "sk-proj") || strings.Contains(err.Error(), "abcd")) {
			t.Errorf("%s: the error carries part of the key: %v", name, err)
		}
	}
}

func TestLimitedAndBroken(t *testing.T) {
	for _, st := range []int{429, 500, 529} {
		_, err := ask(t, NewPerplexity(&fake{status: st, files: []string{"openai_401.json"}}, "k", ""), "")
		if !errors.Is(err, ErrLimited) {
			t.Errorf("%d: %v", st, err)
		}
	}
	_, err := ask(t, NewOpenAI(&fake{files: []string{"openai_401.json"}}, "k", ""), "") // 200 with a body that has no output
	if err != nil {
		t.Errorf("empty output should not fail: %v", err)
	}
	f := &fake{files: []string{"testdata_missing"}}
	if _, err := ask(t, NewOpenAI(f, "k", ""), ""); err == nil {
		t.Error("malformed JSON should fail")
	}
}

func TestAnthropic(t *testing.T) {
	f := &fake{files: []string{"anthropic_ok.json"}}
	a, err := ask(t, NewAnthropic(f, "k", ""), "US")
	if err != nil {
		t.Fatal(err)
	}
	if a.Text != "I'll search.Umami is open source." || len(a.Citations) != 1 || len(a.Sources) != 1 || a.Usage.Searches != 1 {
		t.Errorf("%+v", a)
	}
	if !strings.Contains(string(f.calls[0]), `"user_location"`) {
		t.Error("no location")
	}
}

func TestAnthropicPauseTurn(t *testing.T) {
	f := &fake{files: []string{"anthropic_pause.json", "anthropic_ok.json"}}
	a, err := ask(t, NewAnthropic(f, "k", ""), "")
	if err != nil {
		t.Fatal(err)
	}
	if len(f.calls) != 2 || !strings.Contains(string(f.calls[1]), `"role":"assistant"`) {
		t.Errorf("calls %d", len(f.calls))
	}
	if !strings.HasPrefix(a.Text, "Searching. ") || a.Usage.Searches != 2 {
		t.Errorf("%+v", a)
	}
	// Endless pauses stop after two continuations.
	g := &fake{files: []string{"anthropic_pause.json"}}
	if _, err := ask(t, NewAnthropic(g, "k", ""), ""); err != nil || len(g.calls) != 3 {
		t.Errorf("calls %d err %v", len(g.calls), err)
	}
}

func TestAnthropicSearchOff(t *testing.T) {
	_, err := ask(t, NewAnthropic(&fake{status: 400, files: []string{"anthropic_nosearch.json"}}, "k", ""), "")
	if !errors.Is(err, ErrSetup) {
		t.Errorf("%v", err)
	}
}

func TestPerplexity(t *testing.T) {
	a, err := ask(t, NewPerplexity(&fake{files: []string{"perplexity_ok.json"}}, "k", ""), "")
	if err != nil {
		t.Fatal(err)
	}
	if len(a.Citations) != 3 || a.Usage.Searches != 1 || a.Text != "Example ties visits to revenue." {
		t.Errorf("%+v", a)
	}
}

func TestCostNeverZeroForUnknown(t *testing.T) {
	u := Usage{InputTokens: 1000, OutputTokens: 1000, Searches: 1}
	if Cost(OpenAI, "gpt-9", u) < Cost(OpenAI, "gpt-5.5", u) {
		t.Error("an unknown model should cost the dearest row")
	}
	if Cost(Perplexity, "sonar", Usage{Searches: 1}) != 5000 {
		t.Errorf("%d", Cost(Perplexity, "sonar", Usage{Searches: 1}))
	}
	if Typical(OpenAI, DefaultOpenAIModel) <= 0 {
		t.Error("typical is zero")
	}
}
