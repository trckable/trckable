package surge

import "time"

// Story is how a surge went, from what was counted: the shape of the last
// hour, when it began, its peak and now, and who is there. It never says why
// (only a person can know who shared what): the source and the page are Why's.
type Story struct {
	At      int64   `json:"at"`               // unix seconds the last slice ends: now
	Series  []int64 `json:"series"`           // people active in each five minutes of the last hour, oldest first
	Step    int     `json:"step"`             // minutes in a slice
	Start   int64   `json:"start,omitempty"`  // unix seconds the climb began (the first slice above 1.5x the usual); 0 when it began before the hour
	Peak    int64   `json:"peak"`             // the busiest slice
	PeakAt  int64   `json:"peak_at"`          // unix seconds that slice began
	Now     int64   `json:"now"`              // the last slice
	Mobile  int64   `json:"mobile,omitempty"` // of Devices people with a device known: how many on a phone
	Devices int64   `json:"devices,omitempty"`
	Places  []Place `json:"countries,omitempty"` // the top countries
}

// Place is a country and its people.
type Place struct {
	Country string `json:"country"`
	N       int64  `json:"n"`
}

// BuildStory reads the last hour's slices (the last ends at now) against the
// usual. devices and countries are who is online now.
func BuildStory(series []int64, now time.Time, usual float64, devices, countries []Count) Story {
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
	// least EndTimes the usual; a run that fills the whole hour began before it.
	if Holds(s.Now, usual) {
		i := len(series)
		for i > 0 && Holds(series[i-1], usual) {
			i--
		}
		if i > 0 {
			s.Start = begin(i)
		}
	}
	for _, d := range devices {
		switch d.Value {
		case "mobile":
			s.Mobile += d.N
			s.Devices += d.N
		case "desktop", "tablet":
			s.Devices += d.N
		}
	}
	for i, c := range countries {
		if i == 3 {
			break
		}
		s.Places = append(s.Places, Place{Country: c.Value, N: c.N})
	}
	return s
}
