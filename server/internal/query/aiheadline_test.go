package query

import (
	"context"
	"testing"
)

func TestPerVisitor(t *testing.T) {
	eq(t, "no visitors", PerVisitor(100, 0), 0.0)
	eq(t, "no requests", PerVisitor(0, 50), 0.0)
	eq(t, "negative", PerVisitor(-1, 5), 0.0)
	eq(t, "ratio", PerVisitor(44, 10), 4.4)
}

func TestAICompaniesLeaveSearchEnginesOut(t *testing.T) {
	got := aiCompanies([]AIBot{
		{Name: "OpenAI", Kind: "train", Hits: 5}, {Name: "OpenAI", Kind: "answer", Hits: 4},
		{Name: "Google", Kind: "index", Hits: 900}, {Name: "Anthropic", Kind: "train", Hits: 9},
	})
	eq(t, "companies", len(got), 2)
	eq(t, "first", got[0], AICompany{Name: "Anthropic", Hits: 9})
	eq(t, "tie broken by sum", got[1], AICompany{Name: "OpenAI", Hits: 9})
}

func TestWithFetches(t *testing.T) {
	none := withFetches([]AIAssistant{{Name: "ChatGPT", Visitors: 3}}, nil)
	if none[0].Fetches != nil {
		t.Fatalf("no robot data must not read as zero fetches: %v", *none[0].Fetches)
	}
	got := withFetches(
		[]AIAssistant{{Name: "ChatGPT", Visitors: 3}, {Name: "DeepSeek", Visitors: 2}, {Name: "Perplexity", Visitors: 1}},
		[]AICompany{{Name: "Anthropic", Hits: 68}, {Name: "OpenAI", Hits: 238}},
	)
	by := map[string]AIAssistant{}
	for _, a := range got {
		by[a.Name] = a
	}
	eq(t, "chatgpt fetches", *by["ChatGPT"].Fetches, int64(238))
	if by["DeepSeek"].Fetches != nil {
		t.Fatal("an assistant with no robot of its own has no fetches")
	}
	eq(t, "known company, no reads", *by["Perplexity"].Fetches, int64(0))
	eq(t, "read by robots, sent nobody", by["Claude"].Visitors, int64(0))
	eq(t, "its fetches", *by["Claude"].Fetches, int64(68))
	eq(t, "busiest visitors first", got[0].Name, "ChatGPT")
}

func TestAISearchHeadline(t *testing.T) {
	q := aiRig(t)
	r, err := q.AISearch(context.Background(), week, AIOptions{})
	if err != nil {
		t.Fatal(err)
	}
	eq(t, "humans", r.Humans, int64(4))
	eq(t, "per visitor", r.PerVisitor, float64(84)/4)
	eq(t, "top company", r.Companies[0], AICompany{Name: "OpenAI", Hits: 59})
	eq(t, "companies leave the indexer out", len(r.Companies), 2)
	chat := r.Assistants[0]
	eq(t, "busiest assistant", chat.Name, "ChatGPT")
	eq(t, "its fetches", *chat.Fetches, int64(59))
	eq(t, "page errors default", pageOf(r, "/pricing").Errors, int64(0))
}
