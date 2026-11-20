package api

import (
	"net/http"
	"time"

	"github.com/trckable/trckable/server/internal/query"
	"github.com/trckable/trckable/server/internal/store/sqlite"
)

// What a link shows besides its headline numbers is decided here, on the
// server, like revenue: a section the owner switched off is not asked for
// again with another parameter, and what it would have said is not in the
// answer to be found in a network tab. The page hides the same sections, but
// that is only so it does not offer what would come back empty.

// dimSection says which section of the shared dashboard a breakdown of the
// report belongs to. A dimension not listed here belongs to no section the
// link can show, so a link with any section off never carries it (and the
// test in sharescope_test.go fails when a new dimension is not listed).
var dimSection = map[string]string{
	"page": "pages", "entry_page": "pages", "exit_page": "pages", "group": "pages", "hostname": "pages",
	"channel": "sources", "referrer": "sources", "campaign": "sources", "source": "sources", "medium": "sources", "link": "sources",
	"country": "places", "region": "places", "city": "places", "timezone": "places", "language": "places",
	"device": "tech", "app": "tech", "device_app": "tech", "browser": "tech", "os": "tech", "browser_version": "tech", "screen": "tech", "network": "tech",
}

// openDims are the dimensions a filter may use on any link: a goal is not a
// section, and filtering by one says nothing about the sections that are off.
var openDims = map[string]bool{"goal": true}

// isPageGoal says whether a goal is one of the site's "a page was seen" goals.
func isPageGoal(pageGoals []query.Group, name string) bool {
	for _, g := range pageGoals {
		if name != "" && g.Name == name {
			return true
		}
	}
	return false
}

// sectionsAll says whether the link shows every section it can.
func sectionsAll(sh sqlite.Share) bool {
	for _, s := range sqlite.ShareSections {
		if !sh.Shows(s) {
			return false
		}
	}
	return true
}

// showsDim says whether the link may show a breakdown by this dimension.
func showsDim(sh sqlite.Share, dim string) bool {
	if sectionsAll(sh) || openDims[dim] {
		return true
	}
	section, ok := dimSection[dim]
	return ok && sh.Shows(section)
}

// refuseHiddenFilters answers 403 when the request filters by a dimension of
// a hidden section: a filter would tell what the section's table would, by
// the numbers that change when it is applied.
func refuseHiddenFilters(w http.ResponseWriter, sh sqlite.Share, filters []query.Filter, pageGoals []query.Group) bool {
	for _, f := range filters {
		if !showsDim(sh, f.Dim) || (f.Dim == "goal" && !sh.Shows("pages") && isPageGoal(pageGoals, f.Value)) {
			fail(w, http.StatusForbidden, "this link does not show that")
			return false
		}
	}
	return true
}

// scoped is the report of a link without the breakdowns it does not show. It
// copies rather than edits: the result may be the one the report cache keeps.
// A section that is off has empty tables, not missing ones, so a page reading
// them has nothing to trip on.
func scoped(sh sqlite.Share, in *query.Result, pageGoals []query.Group) *query.Result {
	if in == nil || sectionsAll(sh) {
		return in
	}
	out := *in
	out.Dims = scopedDims(sh, in.Dims)
	out.RevenueDims = scopedDims(sh, in.RevenueDims)
	if !sh.Shows("pages") {
		out.Hosts = 0
		// A goal reached by visiting a page names that page's path: it goes with the pages.
		out.Goals = make([]query.Row, 0, len(in.Goals))
		for _, g := range in.Goals {
			if !isPageGoal(pageGoals, g.Value) && !isPageGoal(pageGoals, g.Label) {
				out.Goals = append(out.Goals, g)
			}
		}
		if in.Signup != nil && isPageGoal(pageGoals, in.Signup.Goal) {
			out.Signup = nil
		}
	}
	if in.Days != nil {
		out.Days = make([]query.Day, len(in.Days))
		for i, d := range in.Days {
			d.Dims = scopedDims(sh, d.Dims)
			out.Days[i] = d
		}
	}
	return &out
}

func scopedDims(sh sqlite.Share, in map[string][]query.Row) map[string][]query.Row {
	if in == nil {
		return nil
	}
	out := make(map[string][]query.Row, len(in))
	for dim, rows := range in {
		if showsDim(sh, dim) {
			out[dim] = rows
		} else {
			out[dim] = []query.Row{}
		}
	}
	return out
}

// lockPeriod holds a report asked through a link that is fixed to one period
// to that period, whatever dates came with it: the range is written here,
// before the request is read, in the site's own time zone, with no comparison
// and no other cut of the range (the same rules fixSharePeriod gives a link
// whose reader chooses). The period is one of sharePeriods.
func (a *API) lockPeriod(r *http.Request, sh sqlite.Share) {
	tz := ""
	if si, err := a.Ctl.SiteInfo(r.Context(), sh.SiteID); err == nil {
		tz = si.Timezone
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	today := a.Now().In(loc)
	p := sharePeriodByID(sh.Period)
	v := r.URL.Query()
	for _, k := range []string{"compare", "cfrom", "cto", "sofar", "sincehour", "bucket", "tz"} {
		v.Del(k)
	}
	v.Set("from", p.start(today).Format("2006-01-02"))
	v.Set("to", today.Format("2006-01-02"))
	r.URL.RawQuery = v.Encode()
}

// sharePeriodByID is the offered period with this id; the default for one that is not offered.
func sharePeriodByID(id string) sharePeriod {
	for _, p := range sharePeriods {
		if p.ID == id {
			return p
		}
	}
	return sharePeriods[1]
}
