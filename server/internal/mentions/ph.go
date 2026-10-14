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

const phQuery = `query($after: DateTime) {
  posts(order: NEWEST, postedAfter: $after, first: 50) {
    nodes { id name tagline slug url website votesCount createdAt user { username } }
  }
}`

// PHPost is a launch as Product Hunt tells it.
type PHPost struct {
	ID, Name, Tagline, Slug, URL, Website string
	Votes                                 int
	At                                    int64
	Maker                                 string
}

// RecentPH returns the posts launched after the given moment.
func RecentPH(ctx context.Context, d Doer, token string, after time.Time) ([]PHPost, error) {
	payload, _ := json.Marshal(map[string]any{"query": phQuery, "variables": map[string]string{"after": after.UTC().Format(time.RFC3339)}})
	body, _, _, err := get(ctx, d, "POST", phAPI, map[string]string{
		"Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json",
	}, bytes.NewReader(payload))
	if err != nil {
		return nil, err
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
			}
		}
		Errors []struct{ Message string }
	}
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, err
	}
	if len(res.Errors) > 0 {
		return nil, &phError{res.Errors[0].Message}
	}
	var out []PHPost
	for _, n := range res.Data.Posts.Nodes {
		at, err := time.Parse(time.RFC3339, n.CreatedAt)
		if err != nil || n.ID == "" {
			continue
		}
		out = append(out, PHPost{ID: n.ID, Name: n.Name, Tagline: n.Tagline, Slug: n.Slug, URL: n.URL, Website: n.Website, Votes: n.VotesCount, At: at.Unix(), Maker: n.User.Username})
	}
	return out, nil
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
		out = append(out, Mention{Source: PH, URL: strings.TrimSpace(p.URL), Title: Snippet(title), Author: p.Maker, Host: PHHost, PostedAt: p.At, Points: p.Votes})
	}
	return out
}
