package answers

import "github.com/trckable/trckable/server/internal/config"

// FromConfig is one Asker for each engine that has a key, in the order the
// dashboard lists them.
func FromConfig(d Doer, c config.Config) []Asker {
	var out []Asker
	if c.OpenAIKey != "" {
		out = append(out, NewOpenAI(d, c.OpenAIKey, c.OpenAIModel))
	}
	if c.PerplexityKey != "" {
		out = append(out, NewPerplexity(d, c.PerplexityKey, c.PerplexityModel))
	}
	if c.AnthropicKey != "" {
		out = append(out, NewAnthropic(d, c.AnthropicKey, c.AnthropicModel))
	}
	return out
}
