// Package busier says when a site has more people on it than it usually has at
// this hour of this weekday, and where the extra people come from. Live shows
// it as one quiet line. It works on aggregates only: counts of people, by
// source, page, country and campaign; never a visitor.
package busier

import (
	"math"
	"sort"
	"time"

	"github.com/trckable/trckable/server/internal/surge"
)

// Every number that decides what Live says is here.
const (
	// Times and Plus: busier means online is at least the usual times Times
	// and at least Plus people above it, so 3 becoming 5 is not news.
	Times = 1.5
	Plus  = 10.0
	// MinDays is how much history a site needs before it has a usual.
	MinDays = 7
	// WeekdayWeeks is how many past same weekdays the usual is the median of;
	// with fewer than MinWeekdayWeeks of them it is the last Days days instead.
	WeekdayWeeks    = 4
	MinWeekdayWeeks = 2
	Days            = 7
	// MinPlus is the fewest extra people a source, page, country or campaign
	// must bring to be named.
	MinPlus = 2
	// Top is how many contributors are told.
	Top = 3
	// Lookback is how far back the start of the rise is searched.
	Lookback = 90 * time.Minute
	// Idle is how long a visitor stays online after their last event.
	Idle = 5 * time.Minute
)

// State is how the site is doing against its usual.
type State string

const (
	Normal  State = ""
	Busier  State = "busier"
	Quieter State = "quieter"
)

// Threshold is the online count from which a site is busier than usual.
func Threshold(usual float64) float64 { return math.Max(usual*Times, usual+Plus) }

// Judge compares online with the usual. A site with no usual is never either.
func Judge(online int64, usual float64, baseline bool) State {
	if !baseline || usual <= 0 {
		return Normal
	}
	o := float64(online)
	switch {
	case o >= Threshold(usual):
		return Busier
	case usual-o >= Plus && o <= usual/Times: // the mirror of the rule above
		return Quieter
	}
	return Normal
}

// Basis says which past hours the usual was taken from.
type Basis string

const (
	Weekdays Basis = "weekday" // the same hour on the last same weekdays
	Week     Basis = "week"    // the same hour on each of the last seven days
	None     Basis = ""
)

// Hours are the past hours the usual is taken from, as the start of each hour
// on the wall clock of loc (so daylight saving does not shift them). first is
// the site's first event: hours that ended before it do not count, and a site
// under MinDays old has no usual at all.
func Hours(now, first time.Time, loc *time.Location) ([]time.Time, Basis) {
	if first.IsZero() || now.Sub(first) < MinDays*24*time.Hour {
		return nil, None
	}
	t := now.In(loc)
	hour := time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), 0, 0, 0, loc)
	pick := func(n, step int) []time.Time {
		var out []time.Time
		for i := 1; i <= n; i++ {
			h := hour.AddDate(0, 0, -step*i)
			if h.Add(time.Hour).After(first) {
				out = append(out, h)
			}
		}
		return out
	}
	if w := pick(WeekdayWeeks, 7); len(w) >= MinWeekdayWeeks {
		return w, Weekdays
	}
	if d := pick(Days, 1); len(d) > 0 {
		return d, Week
	}
	return nil, None
}

// Spread is the usual and its range: the median of the samples and the least
// and most of them.
func Spread(samples []float64) (usual, low, high float64) {
	if len(samples) == 0 {
		return 0, 0, 0
	}
	s := append([]float64(nil), samples...)
	sort.Float64s(s)
	n := len(s)
	if n%2 == 1 {
		usual = s[n/2]
	} else {
		usual = (s[n/2-1] + s[n/2]) / 2
	}
	return usual, s[0], s[n-1]
}

// Median is the median of the samples.
func Median(samples []float64) float64 { u, _, _ := Spread(samples); return u }

// Dimensions, in the order that settles ties between equal contributors.
const (
	DimSource   = "source"
	DimPage     = "page"
	DimCountry  = "country"
	DimCampaign = "campaign"
)

// Count is one value and how many people online have it.
type Count struct {
	Value string
	N     int64
}

// Group is one dimension's people online now, and each value's usual.
type Group struct {
	Dim   string
	Now   []Count
	Usual map[string]float64
}

// Contributor is a value that brings more people than usual.
type Contributor struct {
	Dim   string  `json:"dim"`
	Value string  `json:"value"`
	Now   int64   `json:"now"`
	Usual float64 `json:"usual"`
	Plus  int64   `json:"plus"`
}

// Contributors are the top values by how many more people they bring than
// they usually do (Plus), across every group, at least MinPlus each.
func Contributors(groups []Group) []Contributor {
	var all []Contributor
	for _, g := range groups {
		for _, c := range g.Now {
			u := g.Usual[c.Value]
			plus := c.N - int64(math.Round(u))
			if plus < MinPlus {
				continue
			}
			all = append(all, Contributor{Dim: g.Dim, Value: c.Value, Now: c.N, Usual: round1(u), Plus: plus})
		}
	}
	order := map[string]int{DimSource: 0, DimPage: 1, DimCountry: 2, DimCampaign: 3}
	sort.SliceStable(all, func(i, j int) bool {
		a, b := all[i], all[j]
		if a.Plus != b.Plus {
			return a.Plus > b.Plus
		}
		if a.Dim != b.Dim {
			return order[a.Dim] < order[b.Dim]
		}
		return a.Value < b.Value
	})
	if len(all) > Top {
		all = all[:Top]
	}
	return all
}

// SourceKey is who sent a visit, as people say it: the referring site by
// name ("l.facebook.com" is Facebook), or the channel when it had none.
func SourceKey(host, channel string) string {
	if host != "" {
		return surge.Name(host)
	}
	if channel == "" {
		return "Direct"
	}
	return channel
}

// Entry is some people online who came the same way: how their visit began.
type Entry struct {
	Host, Channel, Page, Campaign, Country string
	N                                      int64
}

// Tally counts people per dimension value. An entry with no value for a
// dimension (no campaign, no country) counts for none of its values.
func Tally(rows []Entry) map[string]map[string]float64 {
	out := map[string]map[string]float64{DimSource: {}, DimPage: {}, DimCountry: {}, DimCampaign: {}}
	add := func(dim, v string, n int64) {
		if v != "" {
			out[dim][v] += float64(n)
		}
	}
	for _, r := range rows {
		add(DimSource, SourceKey(r.Host, r.Channel), r.N)
		add(DimPage, r.Page, r.N)
		add(DimCountry, r.Country, r.N)
		add(DimCampaign, r.Campaign, r.N)
	}
	return out
}

// UsualOf is each value's usual: the median over the sampled hours of how
// many it had online (an hour with none of them counts as 0).
func UsualOf(hours []map[string]map[string]float64) map[string]map[string]float64 {
	out := map[string]map[string]float64{}
	for _, h := range hours {
		for dim, vals := range h {
			if out[dim] == nil {
				out[dim] = map[string]float64{}
			}
			for v := range vals {
				out[dim][v] = 0
			}
		}
	}
	for dim, vals := range out {
		for v := range vals {
			samples := make([]float64, len(hours))
			for i, h := range hours {
				samples[i] = h[dim][v]
			}
			vals[v] = Median(samples)
		}
	}
	return out
}

// Biggest lists a tally's values, most people first, at most n.
func Biggest(t map[string]float64, n int) []Count {
	out := make([]Count, 0, len(t))
	for v, c := range t {
		out = append(out, Count{Value: v, N: int64(math.Round(c))})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].N != out[j].N {
			return out[i].N > out[j].N
		}
		return out[i].Value < out[j].Value
	})
	if len(out) > n {
		out = out[:n]
	}
	return out
}

func round1(f float64) float64 { return math.Round(f*10) / 10 }

// Rest is how many of the extra people the named sources do not explain:
// what is above the usual, less the sources' own extras.
func Rest(online int64, usual float64, groups []Group) int64 {
	extra := int64(math.Round(float64(online) - usual))
	for _, g := range groups {
		if g.Dim != DimSource {
			continue
		}
		for _, c := range g.Now {
			if p := c.N - int64(math.Round(g.Usual[c.Value])); p > 0 {
				extra -= p
			}
		}
	}
	if extra < 0 {
		return 0
	}
	return extra
}

// Online is how many people were online at each minute: those with an event
// in that minute or the four before it. seen[m] holds the visitors with an
// event in minute m; the result has one count per minute, oldest first.
func Online(seen []map[uint64]struct{}) []int64 {
	out := make([]int64, len(seen))
	span := int(Idle / time.Minute)
	for m := range seen {
		union := map[uint64]struct{}{}
		for k := m - span + 1; k <= m; k++ {
			if k < 0 {
				continue
			}
			for v := range seen[k] {
				union[v] = struct{}{}
			}
		}
		out[m] = int64(len(union))
	}
	return out
}

// Since is where the rise began: the first minute of the unbroken stretch,
// ending at the last minute, in which online was at least the threshold.
// capped says the stretch reaches the start of what was looked at, so it
// began at or before that minute. ok is false when the last minute is below.
func Since(online []int64, threshold float64) (idx int, capped, ok bool) {
	n := len(online)
	if n == 0 || float64(online[n-1]) < threshold {
		return 0, false, false
	}
	i := n - 1
	for i > 0 && float64(online[i-1]) >= threshold {
		i--
	}
	return i, i == 0, true
}
