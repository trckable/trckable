package api

import (
	"context"
	"net/http"
	"slices"
	"time"

	"github.com/trckable/trckable/server/internal/modules"
	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/web"
)

// The setup checklist behind the ring in the header. Every value is computed
// from data that already exists, plus the few marks site_setup keeps.
//
//	GET    /api/v1/sites/{site}/setup               the checklist (anyone who can read the site)
//	PUT    /api/v1/sites/{site}/setup/skip/{item}   "Not for me" (owner)
//	DELETE /api/v1/sites/{site}/setup/skip/{item}   bring it back (owner)
//	PUT    /api/v1/sites/{site}/setup/locale        "That's right" for the time zone and currency (owner)
//	PUT    /api/v1/sites/{site}/setup/kind          {"kind":"shop|saas|content|other"}: the owner's choice (owner)
//	POST   /api/v1/sites/{site}/setup/funnel        the owner built a funnel (owner)
//
// Answer: {kind: {value, chosen, provider}, goal_suggestion, done, counted,
// all_set, items: [{id, group, done, counted, skipped, skippable, detail}]}.
// Groups: "core" always counts; "optional" counts until skipped; "more" never
// counts. A write answers with the new checklist.

const (
	proxyFresh = 7 * 24 * time.Hour // events through the proxy within this long make it "done"
	setupCore  = "core"
	setupOpt   = "optional"
	setupMore  = "more"
)

type setupItem struct {
	ID        string         `json:"id"`
	Group     string         `json:"group"`
	Done      bool           `json:"done"`
	Counted   bool           `json:"counted"`
	Skipped   bool           `json:"skipped"`
	Skippable bool           `json:"skippable"`
	Detail    map[string]any `json:"detail,omitempty"`
}

type setupKindOut struct {
	Value    string `json:"value"`
	Chosen   bool   `json:"chosen"`
	Provider string `json:"provider,omitempty"`
}

type setupOut struct {
	Kind           setupKindOut `json:"kind"`
	GoalSuggestion string       `json:"goal_suggestion"`
	Done           int          `json:"done"`
	Counted        int          `json:"counted"`
	AllSet         bool         `json:"all_set"`
	Items          []setupItem  `json:"items"`
}

// setupIn is everything the rules read, so they run without a server.
type setupIn struct {
	Now      time.Time
	Timezone string
	Currency string
	Stored   sqlite.SiteSetup
	Paths    int64 // distinct pageview paths, up to 3
	Known    bool  // the analytics store answered
	Crawlers bool
	OwnIPs   int
	Goals    bool
	Payments *payState // nil: no payment connection
	Search   bool
	// The extras.
	Vitals, Heatmaps bool
	VitalsBytes      int
	Team, Phone      bool
	Keywords         bool
	MentionsOn       bool
	AnswersOn        bool // an engine key is set
	Questions        bool // the site has a question
}

type payState struct {
	Provider string
	Sales    int
}

// goalSuggestion is the goal the Create > Goal form offers first.
func goalSuggestion(kind string) string {
	switch kind {
	case sqlite.KindShop:
		return "Purchase"
	case sqlite.KindSaaS:
		return "Sign-up"
	case sqlite.KindContent:
		return "Newsletter sign-up"
	}
	return ""
}

// setupOrders is the order the counted steps come in for each kind of site, so
// the first one open is the most valuable for it: a shop sets up what it sells
// (goal, revenue) before search; a blog starts with search; the rest of the
// steps follow in the common order.
var setupOrders = map[string][]string{
	sqlite.KindShop:    {"verified", "goal", "payments", "search", "locale", "funnel", "crawlers", "proxy"},
	sqlite.KindSaaS:    {"verified", "goal", "funnel", "payments", "search", "locale", "crawlers", "proxy"},
	sqlite.KindContent: {"verified", "search", "goal", "locale", "crawlers", "proxy", "funnel", "payments"},
}

var setupOrderDefault = []string{"verified", "goal", "locale", "payments", "funnel", "search", "crawlers", "proxy"}

// setupOrder ranks an item id: its place in the kind's order, and the extras (never counted) after.
func setupOrder(kind string) func(string) int {
	order, ok := setupOrders[kind]
	if !ok {
		order = setupOrderDefault
	}
	return func(id string) int {
		for i, o := range order {
			if o == id {
				return i
			}
		}
		return len(order)
	}
}

func buildSetup(in setupIn) setupOut {
	kind := in.Stored.Kind
	out := setupOut{
		Kind:           setupKindOut{Value: kind, Chosen: in.Stored.KindChosen, Provider: in.Stored.Provider},
		GoalSuggestion: goalSuggestion(kind),
		Items:          []setupItem{},
	}
	add := func(id, group string, done bool, detail map[string]any) {
		it := setupItem{ID: id, Group: group, Done: done, Detail: detail}
		if group != setupMore {
			it.Skippable = group == setupOpt
			it.Counted = true
			if it.Skippable && !done && in.skipped(id, kind) {
				it.Skipped, it.Counted = true, false
			}
			if it.Skipped {
				it.Group = setupMore // a skipped row waits under "More you can add"
			}
		}
		out.Items = append(out.Items, it)
	}

	add("verified", setupCore, in.Paths >= 1, map[string]any{"pages": in.Paths})
	add("own_visits", setupMore, in.OwnIPs > 0, nil) // optional: never counted
	locale := in.Timezone != "UTC" || in.Currency != "USD" || in.Stored.LocaleConfirmedAt > 0
	add("locale", setupCore, locale, map[string]any{"timezone": in.Timezone, "currency": in.Currency})
	add("goal", setupCore, in.Goals, map[string]any{"suggestion": out.GoalSuggestion})

	pay := map[string]any{}
	if in.Payments != nil {
		pay["provider"], pay["sales"], pay["connected"] = in.Payments.Provider, in.Payments.Sales, true // a connection, not just a provider seen on the page
	} else if in.Stored.Provider != "" {
		pay["provider"] = in.Stored.Provider // seen on the page: "Connect Stripe"
	}
	add("payments", setupOpt, in.Payments != nil, pay)
	add("funnel", setupOpt, in.Stored.FunnelBuiltAt > 0, nil)
	add("search", setupOpt, in.Search, nil)
	add("crawlers", setupOpt, in.Crawlers, nil)
	var seen int64
	proxy := in.Stored.ProxySeenAt > 0 && in.Now.Sub(time.Unix(in.Stored.ProxySeenAt, 0)) <= proxyFresh
	if in.Stored.ProxySeenAt > 0 {
		seen = in.Stored.ProxySeenAt
	}
	add("proxy", setupOpt, proxy, map[string]any{"last_seen": seen})

	add("vitals", setupMore, in.Vitals, map[string]any{"bytes": in.VitalsBytes})
	add("heatmaps", setupMore, in.Heatmaps, nil)
	add("ga", setupMore, false, nil) // nothing is stored: a link
	add("team", setupMore, in.Team, nil)
	add("phone", setupMore, in.Phone, nil)
	if in.MentionsOn {
		add("mentions", setupMore, in.Keywords, nil)
	}
	if in.AnswersOn {
		add("answers", setupMore, in.Questions, nil)
	}

	rank := setupOrder(kind)
	slices.SortStableFunc(out.Items, func(a, b setupItem) int { return rank(a.ID) - rank(b.ID) })

	for _, it := range out.Items {
		if it.Counted {
			out.Counted++
			if it.Done {
				out.Done++
			}
		}
	}
	out.AllSet = out.Counted > 0 && out.Done == out.Counted
	return out
}

// skipped says whether an item the owner can skip is skipped now: by their
// word, or, with none on record, by a default. Bringing an item back records
// "kept", so a default never skips it again.
func (in setupIn) skipped(id, kind string) bool {
	switch in.Stored.Skips[id] {
	case sqlite.SkipSkipped:
		return true
	case sqlite.SkipKept:
		return false
	}
	switch id {
	case "payments":
		return kind == sqlite.KindContent
	case "funnel":
		return kind != sqlite.KindSaaS && in.Known && in.Paths == 1 // a site that only ever had one page has nothing to follow
	}
	return false
}

// setupOf reads what the rules need for one site.
func (a *API) setupOf(r *http.Request, si sqlite.SiteInfo) (setupOut, error) {
	ctx := r.Context()
	in := setupIn{Now: a.Now(), Timezone: si.Timezone, Currency: si.Currency}
	var err error
	if in.Stored, err = a.Ctl.SetupOf(ctx, si.ID); err != nil {
		return setupOut{}, err
	}
	a.setupFacts(ctx, si.ID, si.LastEventAt, &in)
	if cfg, err := a.Ctl.SiteConfig(ctx, si.ID); err == nil {
		in.OwnIPs = len(cfg.ExcludeIPs)
		in.Goals = len(cfg.PageGoals) > 0
	}
	if !in.Goals {
		labels, _ := a.Ctl.GoalLabels(ctx, si.ID)
		in.Goals = len(labels) > 0
	}
	in.Payments = a.payStateOf(ctx, si.ID)
	if c, err := a.Ctl.SearchConsoleOf(ctx, si.ID); err == nil && c.Property != "" {
		in.Search = true
	}
	set := a.modulesOf(r, si.ID)
	in.Vitals, in.Heatmaps = set.Has("vitals"), set.Has("heatmaps")
	if m, ok := modules.Get("vitals"); ok {
		in.VitalsBytes = web.TrackerSizes().Feature[m.Tracker]
	}
	p := principalOf(r)
	if people, err := a.Ctl.People(ctx, p.account); err == nil {
		in.Team = len(people) > 1
	}
	if p.user != nil {
		if devs, err := a.Ctl.Devices(ctx, p.user.ID, p.device); err == nil {
			in.Phone = len(devs) > 0
		}
	}
	in.MentionsOn = a.MentionsOn
	if in.AnswersOn = a.AnswersOn(); in.AnswersOn {
		if qs, err := a.Ctl.AnswerQuestionsOf(ctx, si.ID); err == nil {
			in.Questions = len(qs) > 0
		}
	}
	if words, err := a.Ctl.MentionKeywords(ctx, si.ID); err == nil {
		in.Keywords = len(words) > 0
	}
	return buildSetup(in), nil
}

// payStateOf is the site's payments, as the checklist reads them: a real
// connection (a hand-typed "custom" one is not) and the sales it has seen.
func (a *API) payStateOf(ctx context.Context, site string) *payState {
	if a.Revenue == nil {
		return nil
	}
	conns, _ := a.Revenue.Connections(ctx, site, "")
	var out *payState
	for _, c := range conns {
		if c.Provider == "custom" {
			continue
		}
		if out == nil {
			out = &payState{Provider: c.Provider}
		}
		out.Sales += c.Payments
	}
	return out
}

func (a *API) checklist(w http.ResponseWriter, r *http.Request) {
	si, err := a.Ctl.SiteInfo(r.Context(), r.PathValue("site"))
	if err != nil {
		fail(w, http.StatusNotFound, "site not found")
		return
	}
	out, err := a.setupOf(r, si)
	if err != nil {
		fail(w, http.StatusInternalServerError, "could not read the checklist")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// setupWrite runs one change to the checklist's marks, then answers with the
// checklist.
func (a *API) setupWrite(w http.ResponseWriter, r *http.Request, change func(site string) error) {
	site := r.PathValue("site")
	if !a.siteExists(w, r) {
		return
	}
	if err := change(site); err != nil {
		fail(w, http.StatusInternalServerError, "could not save")
		return
	}
	a.checklist(w, r)
}

func (a *API) setupSkip(skipped bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		item := r.PathValue("item")
		if !slices.Contains(sqlite.SkippableItems, item) {
			fail(w, http.StatusBadRequest, "that step cannot be skipped")
			return
		}
		a.setupWrite(w, r, func(site string) error {
			return a.Ctl.SetSkip(r.Context(), site, item, skipped, a.Now().Unix())
		})
	}
}

func (a *API) setupLocale(w http.ResponseWriter, r *http.Request) {
	a.setupWrite(w, r, func(site string) error { return a.Ctl.ConfirmLocale(r.Context(), site, a.Now().Unix()) })
}

func (a *API) setupFunnel(w http.ResponseWriter, r *http.Request) {
	a.setupWrite(w, r, func(site string) error { return a.Ctl.MarkFunnelBuilt(r.Context(), site, a.Now().Unix()) })
}

func (a *API) setupKind(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Kind string `json:"kind"`
	}
	if err := decode(r, &in); err != nil || !sqlite.ValidKind(in.Kind) {
		fail(w, http.StatusBadRequest, "kind must be shop, saas, content or other")
		return
	}
	a.setupWrite(w, r, func(site string) error { return a.Ctl.ChooseKind(r.Context(), site, in.Kind) })
}

// factsFor is how long a site's page count is reused when it is still under 3:
// the count scans the site's events, and the ring asks on every page load.
const factsFor = time.Minute

type factsEntry struct {
	at time.Time
	f  query.SetupFacts
}

// setupFacts fills in what the analytics store knows. Three paths is final
// (kept with the site's setup row, never read again); a smaller count is kept
// in memory for a minute, unless it was empty and the site has sent events.
func (a *API) setupFacts(ctx context.Context, site string, lastEvent int64, in *setupIn) {
	if in.Stored.PathsSeen >= 3 {
		in.Known, in.Paths = true, in.Stored.PathsSeen
	}
	q := a.Query()
	if q == nil {
		return
	}
	a.factsMu.Lock()
	e, ok := a.facts[site]
	a.factsMu.Unlock()
	// An empty count is reused only while the site has sent nothing: the first visit shows at once.
	arrived := ok && e.f.Paths == 0 && lastEvent > 0
	if !ok || arrived || in.Now.Sub(e.at) >= factsFor {
		f, err := q.Setup(ctx, site, in.Stored.PathsSeen >= 3)
		if err != nil {
			return
		}
		e = factsEntry{at: in.Now, f: f}
		a.factsMu.Lock()
		if a.facts == nil {
			a.facts = map[string]factsEntry{}
		}
		a.facts[site] = e
		a.factsMu.Unlock()
		if f.Paths >= 3 {
			a.Ctl.SetPathsSeen(ctx, site, f.Paths)
		}
	}
	in.Known, in.Crawlers = true, e.f.Crawlers
	if in.Stored.PathsSeen < 3 {
		in.Paths = e.f.Paths
	}
}
