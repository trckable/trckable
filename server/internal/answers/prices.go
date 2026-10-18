package answers

import "strings"

// Prices as listed on 2026-10-18:
//   https://developers.openai.com/api/docs/pricing (gpt-4.1-mini $0.40/$1.60 per 1M tokens, web search $10 per 1,000 calls)
//   https://platform.claude.com/docs/en/about-claude/pricing (Haiku 5.5 from $0.10/$0.50 per 1M tokens, web search $10 per 1,000)
//   https://docs.perplexity.ai (Sonar $1/$1 per 1M tokens, $5 per 1,000 requests at low search context)

// Price is micro-USD per million tokens, per search and per request.
type Price struct{ InPerM, OutPerM, PerSearch, PerRequest int64 }

var prices = map[Engine]map[string]Price{
	OpenAI: {
		"gpt-4.1-mini": {400_000, 1_600_000, 10_000, 0},
		"gpt-4.1":      {2_000_000, 8_000_000, 10_000, 0},
		"gpt-5":        {1_250_000, 10_000_000, 10_000, 0},
		"gpt-5.5":      {5_000_000, 30_000_000, 10_000, 0},
	},
	Anthropic: {
		"claude-haiku-5-5":  {100_000, 500_000, 10_000, 0},
		"claude-sonnet-5-5": {2_000_000, 10_000_000, 10_000, 0},
		"claude-opus-5-5":   {4_000_000, 20_000_000, 10_000, 0},
	},
	Perplexity: {
		"sonar": {1_000_000, 1_000_000, 0, 5_000},
	},
}

// Cost estimates a call in micro-USD. A model not in the table costs what the
// engine's most expensive row costs, never nothing.
func Cost(e Engine, model string, u Usage) int64 {
	p, ok := price(e, model)
	if !ok {
		for _, x := range prices[e] {
			p.InPerM = max(p.InPerM, x.InPerM)
			p.OutPerM = max(p.OutPerM, x.OutPerM)
			p.PerSearch = max(p.PerSearch, x.PerSearch)
			p.PerRequest = max(p.PerRequest, x.PerRequest)
		}
	}
	return int64(u.InputTokens)*p.InPerM/1_000_000 + int64(u.OutputTokens)*p.OutPerM/1_000_000 +
		int64(u.Searches)*p.PerSearch + p.PerRequest
}

// Typical is what a call usually costs, to reserve a round's budget before it
// starts: about 3 searches and a few thousand tokens.
func Typical(e Engine, model string) int64 {
	return Cost(e, model, Usage{InputTokens: 8000, OutputTokens: 700, Searches: 3})
}

// price finds a model's row: the exact name, or the longest row name it starts
// with before a dash (a provider's dated name, "gpt-4.1-mini-2025-04-14", is
// its undated model).
func price(e Engine, model string) (Price, bool) {
	if p, ok := prices[e][model]; ok {
		return p, true
	}
	best, found := "", false
	for name := range prices[e] {
		if strings.HasPrefix(model, name+"-") && len(name) > len(best) {
			best, found = name, true
		}
	}
	return prices[e][best], found
}
