// Package modules is trckable's à-la-carte layer: every feature beyond the
// core report is a module you turn on per site, and a module that is off
// costs nothing at all —
//
//   - no bytes in the browser: the tracker is built per feature, so a site
//     without goals or outbound links gets a smaller script (see tracker/);
//   - no work on the server: its endpoints answer 404 and its jobs never run;
//   - no code in the dashboard: its chunk is never downloaded.
//
// Modules are first-party only. Nothing here loads foreign code into the
// server: extensions live outside, on the read-only API and MCP tools.
package modules

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"time"
)

// Module is one switchable feature.
type Module struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Summary string `json:"summary"`
	// Tracker is the browser feature this module needs; empty means the
	// module costs nothing in the browser.
	Tracker string `json:"tracker,omitempty"`
	// TrackerBytes is what that feature adds to the script, gzipped. It is
	// filled in from the tracker build's measurements, never guessed.
	TrackerBytes int `json:"tracker_bytes,omitempty"`
	// Server describes what runs on the server while the module is on;
	// empty means it only reads data that is already there.
	Server string `json:"server,omitempty"`
	// Collects marks a module that records something new. Turning one off
	// leaves a gap in the data that cannot be filled in later; the others
	// only read what is already stored, so they can be toggled freely.
	Collects bool `json:"collects"`
	// Gap is what stops being recorded, shown before turning it off.
	Gap string `json:"gap,omitempty"`
	// Label overrides the tag in the list. Almost every module either
	// records something new or reads what is already there; the one that
	// does neither — it records less — says so itself.
	Label string `json:"label,omitempty"`
	// Gives is what turning it on adds, Costs is what to keep in mind while it
	// is on, and Loses is what stops when it goes off. Three short lines each:
	// enough to decide without reading documentation.
	Gives []string `json:"gives,omitempty"`
	Costs []string `json:"costs,omitempty"`
	Loses []string `json:"loses,omitempty"`
	// On by default for a new site.
	On bool `json:"default_on"`
}

// Tracker features, matched by tracker/build.mjs.
const (
	TrackGoals    = "goals"    // data-trckable-goal clicks, scroll goals, the goal API
	TrackOutbound = "outbound" // outbound links and file downloads
	TrackCheckout = "checkout" // visitor id on hosted checkout links
	TrackVitals   = "vitals"   // Core Web Vitals, measured by the browser
	TrackConsent  = "consent"  // reads the site's cookie banner before setting a cookie
	TrackBanner   = "banner"   // the same module in "bar" mode: trckable asks, with a bar of its own
	TrackForms    = "forms"    // form submissions, counted as goals
)

// All modules, in the order the dashboard shows them.
var All = []Module{
	{ID: "goals", Name: "Goals", Summary: "Count signups, trials and anything else you mark, with properties.",
		Tracker: TrackGoals, Collects: true, Gap: "Goals stop being recorded. Past goals stay.", On: true,
		Gives: []string{
			"Counts signups, trials and any click you mark",
			"Shows which source and page produced each one",
			"Feeds funnels, so you can see where people stop",
		},
		Costs: []string{
			"Adds 199 B to the browser script",
			"You mark what counts with data-trckable-goal or trckable('signup')",
		},
		Loses: []string{
			"New goals stop being recorded — that gap cannot be filled in later",
			"Funnels with a goal step stop working",
		}},
	{ID: "outbound", Name: "Outbound links & downloads", Summary: "Count clicks that leave your site and file downloads.",
		Tracker: TrackOutbound, Collects: true, Gap: "Outbound clicks and downloads stop being recorded. Past ones stay.",
		Gives: []string{
			"Counts every click that leaves your site",
			"Counts downloads (pdf, zip, dmg, csv…)",
			"Shows which page sent people away",
		},
		Costs: []string{
			"Adds 157 B to the browser script",
			"Listens for clicks on links — nothing else",
		},
		Loses: []string{
			"Outbound clicks and downloads stop being recorded",
			"Recorded ones stay in your reports",
		}},
	{ID: "revenue", Name: "Revenue", Summary: "Stripe, Lemon Squeezy, Polar, Paddle and Dodo: which traffic pays.",
		Tracker: TrackCheckout, Collects: true, Gap: "New payments stop arriving and checkout links lose the visitor id. Recorded revenue stays.",
		Server: "webhook inbox, payment ledger, reconciliation every 6 h, exchange rates",
		Gives: []string{
			"Revenue, conversion and revenue per visitor beside your traffic",
			"Every sale credited to the visit that earned it, renewals included",
			"Refunds, disputes, test mode and currencies handled for you",
		},
		Costs: []string{
			"Adds 239 B to the browser script (the visitor id on checkout links)",
			"Keeps a webhook inbox and a payment ledger on your own server",
			"Checks your provider for missed payments every 6 hours",
		},
		Loses: []string{
			"New payments stop being recorded — that gap cannot be filled in later",
			"Checkout links lose the visitor id, so later sales are unattributed",
			"Revenue already recorded stays",
		}},
	{ID: "funnels", Name: "Funnels", Summary: "Follow visitors through steps and see where they stop.", On: true,
		Gives: []string{
			"Build a funnel from your own pages and goals",
			"See the drop-off at each step and the time between them",
			"Filters apply, so you can compare channels",
		},
		Costs: []string{"Nothing in the browser — it reads what is already stored"},
		Loses: []string{"The funnel card disappears. Your data is untouched."}},
	{ID: "rhythm", Name: "Weekly rhythm", Summary: "When your visitors come: hour by weekday.", On: true,
		Gives: []string{"Shows when your audience is actually awake", "Good for choosing when to publish or deploy"},
		Costs: []string{"Nothing in the browser — it reads what is already stored"},
		Loses: []string{"The rhythm card disappears. Your data is untouched."}},
	{ID: "journeys", Name: "Journeys", Summary: "One visitor's whole history: visits, pages, goals and payments.", On: true,
		Gives: []string{
			"One person's whole story: every visit, page, goal and payment",
			"Opens from the live feed or the People card",
		},
		Costs: []string{
			"Nothing in the browser",
			"The live feed carries the pseudonymous visitor id while this is on",
		},
		Loses: []string{"The People card and journeys disappear, and the live feed stops carrying visitor ids."}},
	{ID: "map", Name: "Map", Summary: "Visitors on a world map (the map file downloads only when you open it).", On: true,
		Gives: []string{"Your countries on a world map", "Click a country to filter the whole dashboard"},
		Costs: []string{"27 KB of map outlines, downloaded once, only when you open the map tab"},
		Loses: []string{"The map tab disappears. The country list stays."}},
	{ID: "retention", Name: "Retention", Summary: "Of the people who first came in a week, how many came back.", On: true,
		Gives: []string{
			"A cohort grid: each week's new visitors, and how many returned in the weeks after",
			"The one number that says whether a site is building an audience or renting one",
		},
		Costs: []string{"Nothing in the browser — it is worked out from visits you already have"},
		Loses: []string{"The retention card disappears. Nothing stops being recorded."}},
	{ID: "vitals", Name: "Core Web Vitals", Summary: "How fast your pages feel, measured by the browsers that visited them.",
		Tracker: TrackVitals, Collects: true, Gap: "Speed scores stop being recorded. Past ones stay.",
		Gives: []string{
			"Largest contentful paint, layout shift and the slowest interaction, at the 75th percentile",
			"The pages worth fixing first, ranked by how slowly they load",
			"Real visitors on real connections, not a lab test from one machine",
		},
		Costs: []string{
			"The browser does the measuring; the numbers ride along with an event trckable already sends",
			"No extra request, and nothing runs until the page is being hidden",
		},
		Loses: []string{"The Web Vitals card disappears", "New measurements stop; the ones you have stay"}},
	{ID: "consent", Name: "Cookie consent", Summary: "Keep the cookie and ask first — with a bar of trckable's own, or by reading the banner you already run.",
		Tracker: TrackConsent, Label: "records less", Gap: "The script stops asking and follows the site's own setting again.",
		Gives: []string{
			"Until someone agrees, the script stores nothing — and their visit still counts",
			"Read the consent manager you already run, or let trckable ask with a bar of its own",
			"Withdraw it and the cookie is deleted, not just ignored",
		},
		Costs: []string{
			"Reading your banner adds 196 B to the script; trckable's own bar adds 941 B",
			"Which of the two, and how the bar looks, is in Settings → Data & privacy",
			"Before anyone agrees a returning visitor looks new, so multi-day attribution starts at consent",
		},
		Loses: []string{
			"The script stops asking, and goes back to the site's own setting",
			"Nothing already recorded changes",
		}},
	{ID: "crawlers", Name: "AI crawlers & bots", Summary: "Who crawls you: AI answers, search indexing and training data.",
		Collects: true, Gap: "Crawler hits stop being recorded. Past ones stay.",
		Server: "one endpoint your server posts to; nothing extra while idle",
		Gives: []string{
			"See which AI assistants read your pages to answer questions",
			"Separate indexing from training, so you know what each robot wants",
			"The pages they ask for, and the ones they only find errors on",
		},
		Costs: []string{
			"Nothing in the browser — robots do not run JavaScript",
			"Your server forwards robot requests to /api/crawl (one middleware)",
		},
		Loses: []string{"New crawler hits stop being recorded", "Recorded ones stay in your reports"}},
	{ID: "forms", Name: "Form submissions", Summary: "Count every form people send as a goal, with no code.",
		Tracker: TrackForms, Collects: true, Gap: "Form submissions stop being counted. Past ones stay.",
		Gives: []string{
			"A goal each time a form is sent: signups, contact forms, newsletters",
			"Named after the form (its id or where it posts), or data-trckable-form",
			"Only forms the browser accepted: one refused on the spot is not counted",
		},
		Costs: []string{
			"Adds 115 B to the browser script",
			"Shows up with the other goals, so Goals needs to be on",
			"Search forms and forms marked data-trckable-ignore are left out",
		},
		Loses: []string{"New form submissions stop being counted", "Recorded ones stay in your goals"}},
	{ID: "search", Name: "Search Console", Summary: "The Google searches that showed your site, and which of them were clicked.",
		Server: "reads Google Search Console when a report asks, at most once an hour; nothing runs while idle",
		Gives: []string{
			"The searches that showed your site, with clicks, impressions and position",
			"Beside your own numbers, for the same period and page",
			"Which pages Google shows, and for how many searches",
		},
		Costs: []string{
			"Nothing in the browser",
			"A Google service account with read-only access: five minutes, once",
			"Your server asks Google for the report; no visitor data is sent",
		},
		Loses: []string{"The Search terms tab goes away", "Nothing is stored, so nothing is lost"}},
	{ID: "ask", Name: "Ask trckable", Summary: "Ask questions in plain words, with your own AI key. Off until you add one.",
		Server: "one AI request per question, paid by your own key",
		Gives: []string{
			"Ask across every site in plain words",
			"Answers come from read-only tools, never a guess",
			"Works with Claude, any OpenAI-compatible endpoint or local Ollama",
		},
		Costs: []string{
			"Uses your own AI key — trckable never pays and never sends data anywhere else",
			"One request per question, with a token budget per answer",
		},
		Loses: []string{"The Ask panel disappears. Your MCP keys keep working."}},
}

// Core is what every site always has: visits, sources, pages, locations,
// devices, live visitors. It is not switchable, and it is the only thing a
// brand-new site pays for.
const Core = "core"

// Get returns a module by id.
func Get(id string) (Module, bool) {
	for _, m := range All {
		if m.ID == id {
			return m, true
		}
	}
	return Module{}, false
}

// Set is the modules a site has on.
type Set map[string]bool

// Has reports whether a module is on (core is always on).
func (s Set) Has(id string) bool {
	if id == Core || id == "" {
		return true
	}
	return s[id]
}

// Tracker lists the browser features a set needs, sorted, so it maps to one
// prebuilt script variant.
func (s Set) Tracker() []string {
	var out []string
	for _, m := range All {
		if m.Tracker != "" && s.Has(m.ID) {
			out = append(out, m.Tracker)
		}
	}
	sort.Strings(out)
	return out
}

// Store reads and writes which modules a site has on.
type Store struct{ DB *sql.DB }

// Of returns a site's modules, falling back to the defaults.
func (st Store) Of(ctx context.Context, site string) (Set, error) {
	out := Set{}
	for _, m := range All {
		out[m.ID] = m.On
	}
	rows, err := st.DB.QueryContext(ctx, `SELECT module_id, enabled FROM site_modules WHERE site_id = ?`, site)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var on bool
		if err := rows.Scan(&id, &on); err != nil {
			return out, err
		}
		if _, ok := Get(id); ok {
			out[id] = on
		}
	}
	return out, rows.Err()
}

// Set turns a module on or off for a site.
func (st Store) Set(ctx context.Context, site, id string, on bool) error {
	if _, ok := Get(id); !ok {
		return fmt.Errorf("unknown module %q", id)
	}
	_, err := st.DB.ExecContext(ctx, `
		INSERT INTO site_modules (site_id, module_id, enabled, updated_at) VALUES (?, ?, ?, ?)
		ON CONFLICT (site_id, module_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
		site, id, on, time.Now().Unix())
	return err
}

// AnyHas reports whether any site has the module on (for instance-wide jobs:
// no site with Revenue on means no reconciliation and no rate fetching).
func (st Store) AnyHas(ctx context.Context, id string) bool {
	m, ok := Get(id)
	if !ok {
		return false
	}
	var off, on int
	st.DB.QueryRowContext(ctx, `SELECT
			count(*) FILTER (WHERE enabled = 0), count(*) FILTER (WHERE enabled = 1)
		FROM site_modules WHERE module_id = ?`, id).Scan(&off, &on)
	if on > 0 {
		return true
	}
	if !m.On {
		return false
	}
	var sites int // on by default: any site without an explicit "off" row has it
	st.DB.QueryRowContext(ctx, `SELECT count(*) FROM sites`).Scan(&sites)
	return sites > off
}
