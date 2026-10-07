// Package surge follows a site's busy spells and says why in numbers. What
// counts as busier than usual is decided by internal/busier alone; the caller
// passes its verdict in each Reading. It works on aggregates only: how many are
// online, and what they have in common (a source, a page, a country).
package surge

import (
	"sync"
	"time"
)

const (
	// Cooldown is the least between two surges starting on one site.
	Cooldown = 3 * time.Hour
	// Fresh is how long a reading is reused: asking again sooner changes nothing.
	Fresh = 30 * time.Second
)

// Why is what the people online have in common, in real numbers.
type Why struct {
	Source      string  `json:"source,omitempty"`       // who sent most of them, as a name ("Facebook")
	SourceDim   string  `json:"source_dim,omitempty"`   // the filter that finds them: referrer | channel
	SourceValue string  `json:"source_value,omitempty"` // ... and its value
	SourceN     int64   `json:"source_n,omitempty"`     // how many of them
	SourceUsual float64 `json:"source_usual"`           // how many that source usually has online at this hour
	Campaign    string  `json:"campaign,omitempty"`     // a campaign most of them carry, when there is one
	Page        string  `json:"page,omitempty"`         // the page most are on
	PageN       int64   `json:"page_n,omitempty"`
	Country     string  `json:"country,omitempty"` // a country that has most of them
	CountryN    int64   `json:"country_n,omitempty"`
	Before      int64   `json:"before"`  // online a quarter of an hour earlier
	Minutes     int     `json:"minutes"` // ... which is this many minutes ago
}

// Surge is one busy spell of a site.
type Surge struct {
	ID      string  `json:"id"`
	Site    string  `json:"-"`
	Started int64   `json:"started"` // unix seconds
	Ended   int64   `json:"ended"`   // unix seconds; 0 while it lasts
	Online  int64   `json:"online"`  // the most online at once
	Usual   float64 `json:"usual"`   // how many usually are, at this hour of this weekday
	Why     Why     `json:"why"`
}

// Factor is how many times the usual the peak was.
func (s Surge) Factor() float64 { return Ratio(s.Online, s.Usual) }

// Ratio is online against the usual; the usual counts as at least one person.
func Ratio(online int64, usual float64) float64 {
	if usual < 1 {
		usual = 1
	}
	return float64(online) / usual
}

// Reading is one look at a site.
type Reading struct {
	Online int64
	Usual  float64
	Busy   bool // busier than usual, by internal/busier's rule
}

// Act is what a reading did to a site's surge.
type Act int

const (
	None  Act = iota // nothing is going on
	Start            // a surge began
	Keep             // it goes on
	End              // it is over
)

type track struct {
	cur     *Surge
	last    time.Time // when the last surge began
	checked time.Time
}

// Book follows each site's surge in memory: whether one is on, and when the
// last began, so there is at most one in Cooldown.
type Book struct {
	mu    sync.Mutex
	sites map[string]*track
}

func (b *Book) of(site string) *track {
	if b.sites == nil {
		b.sites = map[string]*track{}
	}
	t := b.sites[site]
	if t == nil {
		t = &track{}
		b.sites[site] = t
	}
	return t
}

// Known says whether the book has met this site yet.
func (b *Book) Known(site string) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	_, ok := b.sites[site]
	return ok
}

// Seed teaches the book a site's latest surge from before (a restart): it
// goes on if it never ended, and counts for the cooldown either way.
func (b *Book) Seed(site string, last *Surge) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if _, met := b.sites[site]; met {
		return
	}
	t := b.of(site)
	if last == nil {
		return
	}
	t.last = time.Unix(last.Started, 0)
	if last.Ended == 0 {
		c := *last
		t.cur = &c
	}
}

// Active says whether a surge is on for this site.
func (b *Book) Active(site string) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	t := b.sites[site]
	return t != nil && t.cur != nil
}

// Recent is the surge on now, when the last look was within Fresh: no need to look again.
func (b *Book) Recent(site string, now time.Time) (*Surge, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	t := b.sites[site]
	if t == nil || t.checked.IsZero() || now.Sub(t.checked) >= Fresh || now.Before(t.checked) {
		return nil, false
	}
	return copyOf(t.cur), true
}

func copyOf(s *Surge) *Surge {
	if s == nil {
		return nil
	}
	c := *s
	return &c
}

// Step takes a reading. On Start the surge is returned without its id or
// reasons: the caller fills them in (Name) once it has asked who they are.
func (b *Book) Step(site string, now time.Time, r Reading) (Act, *Surge) {
	b.mu.Lock()
	defer b.mu.Unlock()
	t := b.of(site)
	t.checked = now
	if t.cur != nil {
		if r.Busy {
			if r.Online > t.cur.Online {
				t.cur.Online = r.Online
			}
			return Keep, copyOf(t.cur)
		}
		t.cur.Ended = now.Unix()
		done := t.cur
		t.cur = nil
		return End, done
	}
	if !r.Busy || now.Sub(t.last) < Cooldown {
		return None, nil
	}
	t.last = now
	t.cur = &Surge{Site: site, Started: now.Unix(), Online: r.Online, Usual: r.Usual}
	return Start, copyOf(t.cur)
}

// Name gives the surge that just started its id and reasons.
func (b *Book) Name(site, id string, why Why) *Surge {
	b.mu.Lock()
	defer b.mu.Unlock()
	t := b.of(site)
	if t.cur == nil {
		return nil
	}
	t.cur.ID, t.cur.Why = id, why
	return copyOf(t.cur)
}
