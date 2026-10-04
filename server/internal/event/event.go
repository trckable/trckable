// Package event defines the enriched event that flows ingest → WAL → writer.
//
// By the time an Event exists, the IP address has already been used (geo,
// cookieless hash) and discarded: it is never part of this struct, so it can
// never reach the WAL or the database.
package event

import (
	"encoding/json"
	"time"
)

// MaxAge is the oldest an event may claim to be when it arrives. The tracker
// keeps an unsent event for 24 hours; the hour on top is for a slow clock and
// a slow retry. Ingest refuses anything older, and the writer remembers event
// ids for at least this long, so a resend of an event that was already stored
// is still recognised.
const MaxAge = 25 * time.Hour

// LateAfter is how old an event is when it arrives for it to count as late: a
// slow network or a short retry is minutes, an outage is hours.
const LateAfter = 30 * time.Minute

// Kind of event.
const (
	KindPageview   uint8 = 1
	KindGoal       uint8 = 2
	KindEngagement uint8 = 3 // running total of visible time for a pageview
	// KindCrawler is a robot's page request, reported by the site's own server
	// (robots do not run JavaScript). Browser holds the crawler's name and OS
	// its category, so no new columns are needed.
	KindCrawler uint8 = 4
)

// Event is one enriched analytics event. Field tags are short because every
// event is serialized into the WAL.
type Event struct {
	Site      string `json:"s"`
	Kind      uint8  `json:"k"`
	EventID   uint64 `json:"e"`  // client-generated, used for dedupe
	TS        int64  `json:"t"`  // unix ms, server clock adjusted by client age
	Visitor   uint64 `json:"v"`  // 64-bit visitor id
	FirstSeen int64  `json:"fs"` // unix ms the visitor was first seen (from the id cookie)
	Pageview  uint64 `json:"pv"` // pageview id this event belongs to

	Hostname string `json:"h,omitempty"`
	Path     string `json:"p,omitempty"`

	RefHost string `json:"rh,omitempty"`
	RefURL  string `json:"ru,omitempty"`
	Channel string `json:"ch,omitempty"`

	UTMSource   string `json:"us,omitempty"`
	UTMMedium   string `json:"um,omitempty"`
	UTMCampaign string `json:"uc,omitempty"`
	UTMTerm     string `json:"ut,omitempty"`
	UTMContent  string `json:"uo,omitempty"`

	Country string `json:"co,omitempty"`
	Region  string `json:"re,omitempty"`
	City    string `json:"ci,omitempty"`

	Browser  string `json:"br,omitempty"`
	OS       string `json:"os,omitempty"`
	Device   string `json:"dv,omitempty"`
	Language string `json:"la,omitempty"`
	Screen   uint16 `json:"sw,omitempty"`

	// BrowserVersion is the browser and its major version ("Chrome 129").
	BrowserVersion string `json:"bv,omitempty"`

	Goal  string            `json:"g,omitempty"`
	Props map[string]string `json:"pr,omitempty"`

	EngagedMs uint32 `json:"en,omitempty"`
	ScrollPct uint8  `json:"sc,omitempty"`

	// Core Web Vitals, as the browser measured them. CLS is in thousandths,
	// because the wire carries integers and the score is a small decimal.
	LCPms uint32 `json:"lcp,omitempty"`
	CLS1k uint32 `json:"cls,omitempty"`
	INPms uint32 `json:"inp,omitempty"`

	// Imported marks history brought in by `trckabled import`.
	Imported bool `json:"im,omitempty"`

	// Late marks an event a browser kept back for longer than a visit lasts
	// (a server that was down), so the rest of its visit may be on the way, a
	// request at a time. Sessions it reaches stay open from the moment it
	// arrived, not from the time it says it happened.
	Late bool `json:"lt,omitempty"`
}

// Marshal encodes the event for the WAL.
func (e *Event) Marshal() ([]byte, error) { return json.Marshal(e) }

// Unmarshal decodes a WAL payload.
func Unmarshal(b []byte, e *Event) error { return json.Unmarshal(b, e) }
