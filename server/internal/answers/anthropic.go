package answers

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
)

// Messages API with the web search tool, as documented on 2026-10-18:
// https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
// (model ids: https://platform.claude.com/docs/en/models/overview)

// DefaultAnthropicModel is the current Haiku, the cheapest that searches.
const DefaultAnthropicModel = "claude-haiku-5-5"

const maxContinues = 2

type anthropic struct {
	d     Doer
	key   string
	model string
	url   string
}

// NewAnthropic asks Claude. model "" takes the default.
func NewAnthropic(d Doer, key, model string) Asker {
	if model == "" {
		model = DefaultAnthropicModel
	}
	return &anthropic{d: d, key: key, model: model, url: "https://api.anthropic.com/v1/messages"}
}

func (c *anthropic) Model() string { return c.model }

func (c *anthropic) Engine() Engine { return Anthropic }

type anthropicMsg struct {
	Role    string          `json:"role"`
	Content json.RawMessage `json:"content"`
}

func (c *anthropic) Ask(ctx context.Context, r Request) (Answer, error) {
	tool := map[string]any{"type": "web_search_20250305", "name": "web_search", "max_uses": 3}
	if cc := country(r.Country); cc != "" {
		tool["user_location"] = map[string]any{"type": "approximate", "country": cc}
	}
	first, _ := json.Marshal(r.Question)
	msgs := []anthropicMsg{{Role: "user", Content: first}}
	a := Answer{Engine: Anthropic, Model: c.model}
	for turn := 0; ; turn++ {
		body, _ := json.Marshal(map[string]any{"model": c.model, "max_tokens": 1024, "messages": msgs, "tools": []any{tool}})
		raw, status, err := do(ctx, c.d, c.url, map[string]string{"x-api-key": c.key, "anthropic-version": "2023-06-01"}, body)
		if err != nil {
			if status == 400 && strings.Contains(strings.ToLower(string(raw)), "web search") && strings.Contains(strings.ToLower(string(raw)), "not enabled") {
				return Answer{}, ErrSetup
			}
			return Answer{}, err
		}
		var res struct {
			Model      string            `json:"model"`
			StopReason string            `json:"stop_reason"`
			Content    []json.RawMessage `json:"content"`
			Usage      struct {
				In   int `json:"input_tokens"`
				Out  int `json:"output_tokens"`
				Tool struct {
					Searches int `json:"web_search_requests"`
				} `json:"server_tool_use"`
			} `json:"usage"`
		}
		if json.Unmarshal(raw, &res) != nil {
			return Answer{}, errors.New("the reply could not be read")
		}
		if res.Model != "" {
			a.Model = res.Model
		}
		a.Usage.InputTokens += res.Usage.In
		a.Usage.OutputTokens += res.Usage.Out
		a.Usage.Searches += res.Usage.Tool.Searches
		for _, blk := range res.Content {
			var b struct {
				Type      string `json:"type"`
				Text      string `json:"text"`
				Citations []struct {
					Type  string `json:"type"`
					URL   string `json:"url"`
					Title string `json:"title"`
				} `json:"citations"`
				Content json.RawMessage `json:"content"`
			}
			if json.Unmarshal(blk, &b) != nil {
				continue
			}
			switch b.Type {
			case "text":
				a.Text += b.Text
				for _, ci := range b.Citations {
					if ci.Type == "web_search_result_location" {
						a.Citations = addCite(a.Citations, Citation{URL: ci.URL, Title: ci.Title})
					}
				}
			case "web_search_tool_result":
				var list []struct {
					URL   string `json:"url"`
					Title string `json:"title"`
				}
				if json.Unmarshal(b.Content, &list) == nil { // an error object is not a list
					for _, s := range list {
						a.Sources = addCite(a.Sources, Citation{URL: s.URL, Title: s.Title})
					}
				}
			}
		}
		if res.StopReason != "pause_turn" || turn >= maxContinues {
			break
		}
		// Continue the paused turn: send the assistant message back unchanged.
		whole, _ := json.Marshal(res.Content)
		msgs = append(msgs, anthropicMsg{Role: "assistant", Content: whole})
	}
	a.Text = clip(a.Text, MaxText)
	return a, nil
}
