// Package answers asks AI assistants a question the way a buyer would and
// reads who they name and link. Official APIs only, web search on, and only
// the question and an approximate country leave the server.
package answers

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"unicode/utf8"
)

// Engine is one assistant: "openai", "perplexity" or "anthropic".
type Engine string

const (
	OpenAI     Engine = "openai"
	Perplexity Engine = "perplexity"
	Anthropic  Engine = "anthropic"
)

// Name is what the dashboard calls an engine.
func (e Engine) Name() string {
	switch e {
	case OpenAI:
		return "ChatGPT"
	case Perplexity:
		return "Perplexity"
	case Anthropic:
		return "Claude"
	}
	return string(e)
}

// Request is everything an engine is told: the question, and a country.
type Request struct{ Question, Country string }

// Citation is a page an answer links to.
type Citation struct {
	URL   string `json:"url"`
	Title string `json:"title"`
}

// Usage is what a call used, to estimate its cost.
type Usage struct{ InputTokens, OutputTokens, Searches int }

// Answer is one reply.
type Answer struct {
	Engine    Engine
	Model     string
	Text      string
	Citations []Citation // linked in the answer
	Sources   []Citation // consulted, when the engine reports them
	Usage     Usage
}

// Asker asks one engine.
type Asker interface {
	Engine() Engine
	Ask(ctx context.Context, r Request) (Answer, error)
}

// Modeler is an Asker that can say which model it asks, to estimate a round's cost.
type Modeler interface{ Model() string }

// Doer is the part of an HTTP client the adapters need, so tests answer from
// recorded files.
type Doer interface {
	Do(*http.Request) (*http.Response, error)
}

// The errors carry fixed messages only: never a provider's body, which can
// hold a partly masked key.
var (
	ErrLimited = errors.New("the engine asked for a pause")
	ErrKey     = errors.New("the engine refused the key")
	ErrSetup   = errors.New("the engine needs a setting turned on")
)

const (
	maxBody = 2 << 20 // a reply is read up to 2 MB
	// MaxText is how much of an answer is kept.
	MaxText = 16 << 10
)

// do sends one JSON request and returns the body of a 200. Every other status
// becomes a fixed error; for 400 the body is returned too, so an adapter can
// recognise a known cause, and must never pass it on.
func do(ctx context.Context, d Doer, addr string, header map[string]string, body []byte) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, addr, strings.NewReader(string(body)))
	if err != nil {
		return nil, 0, errors.New("could not build the request")
	}
	req.Header.Set("User-Agent", "trckable-answers")
	req.Header.Set("Content-Type", "application/json")
	for k, v := range header {
		req.Header.Set(k, v)
	}
	res, err := d.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, 0, ctx.Err()
		}
		// The transport error can carry the address, never the key; still say little.
		return nil, 0, fmt.Errorf("%w: could not reach the engine", ErrLimited)
	}
	defer res.Body.Close()
	b, err := io.ReadAll(io.LimitReader(res.Body, maxBody))
	switch {
	case res.StatusCode == http.StatusOK:
		if err != nil {
			return nil, res.StatusCode, errors.New("the reply was cut short")
		}
		return b, res.StatusCode, nil
	case res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden:
		return nil, res.StatusCode, ErrKey
	case res.StatusCode == http.StatusTooManyRequests || res.StatusCode >= 500 || res.StatusCode == 529:
		return nil, res.StatusCode, ErrLimited
	case res.StatusCode == http.StatusBadRequest:
		return b, res.StatusCode, fmt.Errorf("the engine refused the question (%d)", res.StatusCode)
	}
	return nil, res.StatusCode, fmt.Errorf("the engine answered %d", res.StatusCode)
}

// clip cuts text to at most max bytes without splitting a character.
func clip(s string, max int) string {
	if len(s) <= max {
		return s
	}
	s = s[:max]
	for !utf8.ValidString(s) && len(s) > 0 {
		s = s[:len(s)-1]
	}
	return s
}

// An answer keeps at most this many citations, each URL cut to this many bytes.
const (
	maxCites   = 50
	maxCiteURL = 2048
)

// addCite appends c unless its URL is empty or already listed.
func addCite(list []Citation, c Citation) []Citation {
	c.URL = clip(strings.TrimSpace(c.URL), maxCiteURL)
	if c.URL == "" || len(list) >= maxCites {
		return list
	}
	for _, x := range list {
		if x.URL == c.URL {
			return list
		}
	}
	return append(list, Citation{URL: c.URL, Title: clip(strings.TrimSpace(c.Title), 300)})
}

// country is the code to send, or "" when it is not two letters.
func country(c string) string {
	c = strings.ToUpper(strings.TrimSpace(c))
	if len(c) != 2 || c[0] < 'A' || c[0] > 'Z' || c[1] < 'A' || c[1] > 'Z' {
		return ""
	}
	return c
}
