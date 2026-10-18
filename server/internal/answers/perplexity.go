package answers

import (
	"context"
	"encoding/json"
	"errors"
)

// Sonar chat completions, as documented on 2026-10-18:
// https://docs.perplexity.ai (chat completions reference)

// DefaultPerplexityModel is the plain Sonar model.
const DefaultPerplexityModel = "sonar"

type perplexity struct {
	d     Doer
	key   string
	model string
	url   string
}

// NewPerplexity asks Perplexity. model "" takes the default.
func NewPerplexity(d Doer, key, model string) Asker {
	if model == "" {
		model = DefaultPerplexityModel
	}
	return &perplexity{d: d, key: key, model: model, url: "https://api.perplexity.ai/chat/completions"}
}

func (p *perplexity) Model() string { return p.model }

func (p *perplexity) Engine() Engine { return Perplexity }

func (p *perplexity) Ask(ctx context.Context, r Request) (Answer, error) {
	req := map[string]any{"model": p.model, "messages": []any{map[string]any{"role": "user", "content": r.Question}}}
	if c := country(r.Country); c != "" {
		req["web_search_options"] = map[string]any{"user_location": map[string]any{"country": c}}
	}
	body, _ := json.Marshal(req)
	raw, _, err := do(ctx, p.d, p.url, map[string]string{"Authorization": "Bearer " + p.key}, body)
	if err != nil {
		return Answer{}, err
	}
	var res struct {
		Model   string `json:"model"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		SearchResults []struct {
			URL   string `json:"url"`
			Title string `json:"title"`
		} `json:"search_results"`
		Citations []string `json:"citations"`
		Usage     struct {
			In  int `json:"prompt_tokens"`
			Out int `json:"completion_tokens"`
		} `json:"usage"`
	}
	if json.Unmarshal(raw, &res) != nil || len(res.Choices) == 0 {
		return Answer{}, errors.New("the reply could not be read")
	}
	a := Answer{Engine: Perplexity, Model: p.model, Text: clip(res.Choices[0].Message.Content, MaxText),
		Usage: Usage{InputTokens: res.Usage.In, OutputTokens: res.Usage.Out, Searches: 1}}
	if res.Model != "" {
		a.Model = res.Model
	}
	for _, s := range res.SearchResults {
		a.Citations = addCite(a.Citations, Citation{URL: s.URL, Title: s.Title})
	}
	for _, u := range res.Citations {
		a.Citations = addCite(a.Citations, Citation{URL: u})
	}
	return a, nil
}
