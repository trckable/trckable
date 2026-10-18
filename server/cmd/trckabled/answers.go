package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"strings"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
	"github.com/trckable/trckable/server/internal/answers"
	"github.com/trckable/trckable/server/internal/config"
)

// answersCmd: trckabled answers check <domain> "<question>" [--country DE] [--engine openai]
// asks each configured engine once and prints what it said. It writes nothing.
func answersCmd(cfg config.Config, args []string) error {
	if len(args) == 0 || args[0] != "check" {
		return errors.New(`usage: trckabled answers check <domain> "<question>" [--country DE] [--engine openai]`)
	}
	fs := flag.NewFlagSet("answers check", flag.ContinueOnError)
	country := fs.String("country", "", "two-letter country the question is asked from")
	only := fs.String("engine", "", "ask one engine: openai, perplexity or anthropic")
	// The flags may stand before or after the two words.
	var words []string
	rest := args[1:]
	for len(rest) > 0 {
		if strings.HasPrefix(rest[0], "-") {
			if err := fs.Parse(rest); err != nil {
				return err
			}
			rest = fs.Args()
			continue
		}
		words = append(words, rest[0])
		rest = rest[1:]
	}
	if len(words) != 2 {
		return errors.New(`usage: trckabled answers check <domain> "<question>" [--country DE] [--engine openai]`)
	}
	domain, question := strings.ToLower(strings.TrimPrefix(words[0], "www.")), words[1]
	if answers.Index(question, domain) >= 0 {
		return errors.New("the question names the site; ask it the way a buyer would")
	}
	askers := answers.FromConfig(alerts.SafeClient(90*time.Second), cfg)
	if len(askers) == 0 {
		return errors.New("no engine key is set: TRCKABLE_OPENAI_KEY, TRCKABLE_PERPLEXITY_KEY or TRCKABLE_ANTHROPIC_KEY")
	}
	for _, a := range askers {
		if *only != "" && string(a.Engine()) != *only {
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		ans, err := a.Ask(ctx, answers.Request{Question: question, Country: *country})
		cancel()
		fmt.Printf("%s\n", a.Engine().Name())
		if err != nil {
			fmt.Printf("  could not ask: %v\n\n", err)
			continue
		}
		sc := answers.ScoreAnswer(ans, []string{domain}, domain, nil)
		fmt.Printf("  named: %v  linked: %v  position: %d\n", sc.Named, sc.Cited, sc.Position)
		for _, c := range ans.Citations {
			fmt.Printf("  link: %s\n", c.URL)
		}
		fmt.Printf("  about $%.4f (%s)\n  %s\n\n", float64(answers.Cost(a.Engine(), ans.Model, ans.Usage))/1e6, ans.Model, excerpt(ans.Text, 400))
	}
	return nil
}

func excerpt(s string, n int) string {
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > n {
		return string(r[:n]) + "…"
	}
	return s
}
