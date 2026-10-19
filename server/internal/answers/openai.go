package answers

import (
	"context"
	"encoding/json"
	"errors"
)

// Responses API with the web_search tool, as documented on 2026-10-18:
// https://developers.openai.com/api/docs/guides/tools-web-search

// DefaultOpenAIModel supports web_search (listed in the guide above) at the
// lowest token price of those listed.
const DefaultOpenAIModel = "gpt-4.1-mini"

type openAI struct {
	d     Doer
	key   string
	model string
	url   string
}

// NewOpenAI asks ChatGPT. model "" takes the default.
func NewOpenAI(d Doer, key, model string) Asker {
	if model == "" {
		model = DefaultOpenAIModel
	}
	return &openAI{d: d, key: key, model: model, url: "https://api.openai.com/v1/responses"}
}

func (o *openAI) Model() string { return o.model }

func (o *openAI) Engine() Engine { return OpenAI }

func (o *openAI) Ask(ctx context.Context, r Request) (Answer, error) {
	tool := map[string]any{"type": "web_search"}
	if c := country(r.Country); c != "" {
		tool["user_location"] = map[string]any{"type": "approximate", "country": c}
	}
	body, _ := json.Marshal(map[string]any{
		"model": o.model, "input": r.Question, "store": false,
		"tools": []any{tool}, "include": []string{"web_search_call.action.sources"},
		"max_output_tokens": 1024, "max_tool_calls": 3,
	})
	raw, _, err := do(ctx, o.d, o.url, map[string]string{"Authorization": "Bearer " + o.key}, body)
	if err != nil {
		return Answer{}, err
	}
	var res struct {
		Model  string `json:"model"`
		Output []struct {
			Type   string `json:"type"`
			Action struct {
				Sources []struct {
					URL   string `json:"url"`
					Title string `json:"title"`
				} `json:"sources"`
			} `json:"action"`
			Content []struct {
				Type        string `json:"type"`
				Text        string `json:"text"`
				Annotations []struct {
					Type  string `json:"type"`
					URL   string `json:"url"`
					Title string `json:"title"`
				} `json:"annotations"`
			} `json:"content"`
		} `json:"output"`
		Usage struct {
			In  int `json:"input_tokens"`
			Out int `json:"output_tokens"`
		} `json:"usage"`
	}
	if json.Unmarshal(raw, &res) != nil {
		return Answer{}, errors.New("the reply could not be read")
	}
	a := Answer{Engine: OpenAI, Model: o.model, Usage: Usage{InputTokens: res.Usage.In, OutputTokens: res.Usage.Out}}
	if res.Model != "" {
		a.Model = res.Model
	}
	for _, it := range res.Output {
		switch it.Type {
		case "web_search_call":
			a.Usage.Searches++
			for _, s := range it.Action.Sources {
				a.Sources = addCite(a.Sources, Citation{URL: s.URL, Title: s.Title})
			}
		case "message":
			for _, c := range it.Content {
				if c.Type != "output_text" {
					continue
				}
				a.Text += c.Text
				for _, n := range c.Annotations {
					if n.Type == "url_citation" {
						a.Citations = addCite(a.Citations, Citation{URL: n.URL, Title: n.Title})
					}
				}
			}
		}
	}
	a.Text = clip(a.Text, MaxText)
	return a, nil
}
