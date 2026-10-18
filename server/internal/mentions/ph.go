package mentions

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"time"
)

// Product Hunt, through its GraphQL API with a developer token: the newest
// posts, matched afterwards to each site's words. One look serves every site.

const phAPI = "https://api.producthunt.com/v2/api/graphql"

const phQuery = `query($after: DateTime, $cursor: String) {
  posts(order: NEWEST, postedAfter: $after, first: 50, after: $cursor) {
    nodes { id name tagline slug url website votesCount createdAt user { username } }
    pageInfo { hasNextPage endCursor }
  }
}`

// PHPages is the most pages one look reads (50 launches each).
const PHPages = 20

// PHPost is a launch as Product Hunt tells it.
type PHPost struct {
	ID, Name, Tagline, Slug, URL, Website string
	Votes                                 int
	At                                    int64
	Maker                                 string
}

// RecentPH returns the posts launched after the given moment, page after page
// (at most PHPages) until the list ends, so a busy day is not cut short.
func RecentPH(ctx context.Context, d Doer, token string, after time.Time) ([]PHPost, error) {
	var out []PHPost
	cursor := ""
	for page := 0; page < PHPages; page++ {
		posts, next, err := phPage(ctx, d, token, after, cursor)
		if err != nil {
			return out, err
		}
		out = append(out, posts...)
		if next == "" {
			break
		}
		cursor = next
	}
	return out, nil
}

// phPage reads one page and the cursor of the next ("" at the end).
func phPage(ctx context.Context, d Doer, token string, after time.Time, cursor string) ([]PHPost, string, error) {
	vars := map[string]any{"after": after.UTC().Format(time.RFC3339)}
	if cursor != "" {
		vars["cursor"] = cursor
	}
	payload, _ := json.Marshal(map[string]any{"query": phQuery, "variables": vars})
	body, _, _, err := get(ctx, d, "POST", phAPI, map[string]string{
		"Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json",
	}, bytes.NewReader(payload))
	if err != nil {
		return nil, "", err
	}
	var res struct {
		Data struct {
			Posts struct {
				Nodes []struct {
					ID, Name, Tagline, Slug, URL, Website string
					VotesCount                            int
					CreatedAt                             string
					User                                  struct{ Username string }
				}
				PageInfo struct {
					HasNextPage bool
					EndCursor   string
				}
			}
		}
		Errors []struct{ Message string }
	}
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, "", err
	}
	if len(res.Errors) > 0 {
		return nil, "", &phError{res.Errors[0].Message}
	}
	var out []PHPost
	for _, n := range res.Data.Posts.Nodes {
		at, err := time.Parse(time.RFC3339, n.CreatedAt)
		if err != nil || n.ID == "" {
			continue
		}
		out = append(out, PHPost{ID: n.ID, Name: n.Name, Tagline: n.Tagline, Slug: n.Slug, URL: n.URL, Website: n.Website, Votes: n.VotesCount, At: at.Unix(), Maker: n.User.Username})
	}
	next := ""
	if res.Data.Posts.PageInfo.HasNextPage {
		next = res.Data.Posts.PageInfo.EndCursor
	}
	return out, next, nil
}

type phError struct{ msg string }

func (e *phError) Error() string { return "Product Hunt: " + e.msg }

// PHMatch turns the posts that name one of the keywords (in the name, the
// tagline or the site's address) into mentions.
func PHMatch(posts []PHPost, keywords []string) []Mention {
	var out []Mention
	for _, p := range posts {
		if !HasAny(p.Name+" "+p.Tagline+" "+p.Website, keywords) || !Web(p.URL) {
			continue
		}
		title := p.Name
		if p.Tagline != "" {
			title += " — " + p.Tagline
		}
		out = append(out, Mention{Source: PH, URL: strings.TrimSpace(p.URL), Title: Snippet(title), Snippet: Sentence(p.Tagline, keywords), Author: p.Maker, Host: PHHost, PostedAt: p.At, Points: p.Votes, Link: strings.TrimSpace(p.Website)})
	}
	return out
}
