package query

import "sort"

// The AI & Search headline: how much AI reads the site, against the people who
// come, and what each assistant sends back for what its robots read.

// AICompany is one company's AI robots added up (answering and training).
type AICompany struct {
	Name string `json:"name"`
	Hits int64  `json:"hits"`
}

// aiVendors names the robot company behind each assistant: the assistant's
// visitors and its robots' fetches are two sides of one product. An assistant
// with no robot of its own (DeepSeek, Grok) is not listed, so it has no fetches
// to compare.
var aiVendors = map[string]string{
	"ChatGPT": "OpenAI", "Claude": "Anthropic", "Perplexity": "Perplexity", "Gemini": "Google",
	"Copilot": "Microsoft", "Mistral": "Mistral", "Meta AI": "Meta",
}

// aiCompanies adds the AI robots up by company, busiest first. Search
// engines' indexers are not AI's reading and are left out.
func aiCompanies(bots []AIBot) []AICompany {
	by := map[string]int64{}
	for _, b := range bots {
		if b.Kind != crawlIndex {
			by[b.Name] += b.Hits
		}
	}
	out := make([]AICompany, 0, len(by))
	for name, hits := range by {
		out = append(out, AICompany{Name: name, Hits: hits})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Hits != out[j].Hits {
			return out[i].Hits > out[j].Hits
		}
		return out[i].Name < out[j].Name
	})
	return out
}

// PerVisitor is how many AI robot requests came for each human visitor; 0 when
// there were no visitors or no requests to compare.
func PerVisitor(crawled, humans int64) float64 {
	if crawled <= 0 || humans <= 0 {
		return 0
	}
	return float64(crawled) / float64(humans)
}

// withFetches gives each assistant its robots' fetches, adds an assistant its
// robots read for but that sent nobody (the very case worth seeing), and orders
// them busiest first. Only with robot data at all, and only for an assistant
// whose company we know: the others keep nil fetches, so "no data" is never
// shown as "no fetches".
func withFetches(as []AIAssistant, companies []AICompany) []AIAssistant {
	if len(companies) > 0 {
		hits := map[string]int64{}
		for _, c := range companies {
			hits[c.Name] = c.Hits
		}
		have := map[string]bool{}
		for _, a := range as {
			have[a.Name] = true
		}
		for name, vendor := range aiVendors {
			if !have[name] && hits[vendor] > 0 {
				as = append(as, AIAssistant{Name: name})
			}
		}
		for i := range as {
			if vendor, ok := aiVendors[as[i].Name]; ok {
				n := hits[vendor]
				as[i].Fetches = &n
			}
		}
	}
	for i := range as {
		as[i].Company = aiVendors[as[i].Name]
	}
	sort.Slice(as, func(i, j int) bool {
		a, b := as[i], as[j]
		if a.Visitors != b.Visitors {
			return a.Visitors > b.Visitors
		}
		if fa, fb := fetchesOf(a), fetchesOf(b); fa != fb {
			return fa > fb
		}
		return a.Name < b.Name
	})
	return as
}

func fetchesOf(a AIAssistant) int64 {
	if a.Fetches == nil {
		return 0
	}
	return *a.Fetches
}
