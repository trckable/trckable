package surge

import (
	"sort"
	"time"
)

// Story is how a surge went, from what was counted: the shape of the last
// hour, when it began, its peak and now, and who is there. It never says why
// (only a person can know who shared what): the source and the page are Why's.
type Story struct {
	At      int64   `json:"at"`               // unix seconds the last slice ends: now
	Series  []int64 `json:"series"`           // people active in each five minutes of the last hour, oldest first
	Step    int     `json:"step"`             // minutes in a slice
	Start   int64   `json:"start,omitempty"`  // unix seconds the climb began (the first slice busier than usual); 0 when it began before the hour
	Peak    int64   `json:"peak"`             // the busiest slice
	PeakAt  int64   `json:"peak_at"`          // unix seconds that slice began
	Now     int64   `json:"now"`              // the last slice
	Mobile  int64   `json:"mobile,omitempty"` // of Devices people with a device known: how many on a phone
	Devices int64   `json:"devices,omitempty"`
	Places  []Place `json:"countries,omitempty"` // the top countries
	Sources []Tally `json:"sources,omitempty"`   // who sent the people online, most first (a source by its name)
	Pages   []Tally `json:"pages,omitempty"`     // the pages they are on, most first
}

// Tally is a name and how many of the people online it holds.
type Tally struct {
	Name string `json:"name"`
	N    int64  `json:"n"`
}

// Place is a country and its people.
type Place struct {
	Country string `json:"country"`
	N       int64  `json:"n"`
}

// BuildStory reads the last hour's slices (the last ends at now) against the
// usual. devices and countries are who is online now.
func BuildStory(series []int64, now time.Time, busy func(int64) bool, seen Seen) Story {
	step := 5
	s := Story{Series: series, Step: step, At: now.Unix()}
	if len(series) == 0 {
		return s
	}
	slice := time.Duration(step) * time.Minute
	begin := func(i int) int64 { return now.Add(-time.Duration(len(series)-i) * slice).Unix() }
	for i, n := range series {
		if n > s.Peak || (n == s.Peak && s.PeakAt == 0) {
			s.Peak, s.PeakAt = n, begin(i)
		}
	}
	s.Now = series[len(series)-1]
	// The climb began at the first slice of the run that ends now and stays at
	// busier than usual; a run that fills the whole hour began before it.
	if busy(s.Now) {
		i := len(series)
		for i > 0 && busy(series[i-1]) {
			i--
		}
		if i > 0 {
			s.Start = begin(i)
		}
	}
	for _, d := range seen.Devices {
		switch d.Value {
		case "mobile":
			s.Mobile += d.N
			s.Devices += d.N
		case "desktop", "tablet":
			s.Devices += d.N
		}
	}
	for i, c := range seen.Countries {
		if i == 3 {
			break
		}
		s.Places = append(s.Places, Place{Country: c.Value, N: c.N})
	}
	s.Sources = sources(seen)
	for i, c := range seen.Pages {
		if i == 3 {
			break
		}
		s.Pages = append(s.Pages, Tally{Name: c.Value, N: c.N})
	}
	return s
}

// sources is who sent the people online: the referring sites by their names
// (l.facebook.com and m.facebook.com are one), or the channels when nobody
// has a referring site. At most four.
func sources(seen Seen) []Tally {
	var out []Tally
	if len(seen.Hosts) > 0 {
		at := map[string]int{}
		for _, h := range seen.Hosts {
			n := Name(h.Value)
			if i, ok := at[n]; ok {
				out[i].N += h.N
				continue
			}
			at[n] = len(out)
			out = append(out, Tally{Name: n, N: h.N})
		}
		sort.SliceStable(out, func(a, b int) bool { return out[a].N > out[b].N })
	} else {
		for _, c := range seen.Channels {
			out = append(out, Tally{Name: c.Value, N: c.N})
		}
	}
	if len(out) > 4 {
		out = out[:4]
	}
	return out
}
