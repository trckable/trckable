package mentions

import (
	"context"
	"encoding/json"
	"net/url"
	"strconv"
)

// Hacker News, through Algolia's search: stories and comments that name a
// keyword, newer than a cursor.

const algolia = "https://hn.algolia.com/api/v1/"

type hnHit struct {
	ObjectID    string   `json:"objectID"`
	CreatedAt   int64    `json:"created_at_i"`
	Title       string   `json:"title"`
	StoryTitle  string   `json:"story_title"`
	StoryText   string   `json:"story_text"`
	CommentText string   `json:"comment_text"`
	URL         string   `json:"url"`
	Author      string   `json:"author"`
	Points      int      `json:"points"`
	Tags        []string `json:"_tags"`
}

func hnItem(id string) string { return "https://news.ycombinator.com/item?id=" + id }

// SearchHN returns what Hacker News holds for keyword posted after since
// (unix seconds), newest first, keeping only the hits that really name it.
func SearchHN(ctx context.Context, d Doer, keyword string, since int64) ([]Mention, error) {
	q := url.Values{
		"query":          {`"` + keyword + `"`},
		"tags":           {"(story,comment)"},
		"numericFilters": {"created_at_i>" + strconv.FormatInt(since, 10)},
		"hitsPerPage":    {"50"},
	}
	body, _, _, err := get(ctx, d, "GET", algolia+"search_by_date?"+q.Encode(), nil, nil)
	if err != nil {
		return nil, err
	}
	var res struct{ Hits []hnHit }
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, err
	}
	var out []Mention
	for _, h := range res.Hits {
		text := h.Title + " " + h.StoryText + " " + h.CommentText + " " + h.URL
		if h.ObjectID == "" || h.CreatedAt <= since || !Has(text, keyword) {
			continue
		}
		title, kind := h.Title, ""
		if title == "" {
			title, kind = h.CommentText, "comment"
		}
		out = append(out, Mention{Source: HN, URL: hnItem(h.ObjectID), Kind: kind, Title: Snippet(title), Author: h.Author,
			Host: HNHost, PostedAt: h.CreatedAt, Points: h.Points})
	}
	return out, nil
}

// FrontHN returns the item addresses on Hacker News's front page right now.
func FrontHN(ctx context.Context, d Doer) (map[string]int, error) {
	body, _, _, err := get(ctx, d, "GET", algolia+"search?tags=front_page&hitsPerPage=40", nil, nil)
	if err != nil {
		return nil, err
	}
	var res struct{ Hits []hnHit }
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, err
	}
	out := map[string]int{}
	for _, h := range res.Hits {
		if h.ObjectID != "" {
			out[hnItem(h.ObjectID)] = h.Points
		}
	}
	return out, nil
}
