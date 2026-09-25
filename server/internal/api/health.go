package api

import (
	"context"
	"net/http"
	"time"
)

// Health is what Settings → Health shows: whether events are flowing, how much
// room is left, and when each background job last did its work. It is the
// answer to "is this thing still fine?" without reading logs.
type Health struct {
	Version   string `json:"version"`
	UptimeS   int64  `json:"uptime_s"`
	Events    Flow   `json:"events"`
	Store     Store  `json:"store"`
	Analytics string `json:"analytics"` // ready | warming | error
	Memory    uint64 `json:"memory_bytes"`
	// MemorySource says what Memory is: "rss" (the whole process, analytics
	// store included) or "go" (the Go runtime only, where no RSS can be read).
	MemorySource string `json:"memory_source"`
	Backup       Backup `json:"backup"`
	Payments     *Pay   `json:"payments,omitempty"`
}

// Backup is the newest copy on disk: when it was written and how big it is.
type Backup struct {
	At    int64 `json:"at"` // unix seconds, 0 when there is none yet
	Bytes int64 `json:"bytes"`
	// Offsite is the bucket copies go to, without its keys; empty when
	// backups stay on this machine only.
	Offsite     string `json:"offsite,omitempty"`
	OffsiteAt   int64  `json:"offsite_at,omitempty"`   // the last copy that arrived
	OffsiteDays int    `json:"offsite_days,omitempty"` // how long copies are kept there
	OffsiteErr  string `json:"offsite_error,omitempty"`
}

// Flow is the ingest pipeline: accepted, dropped and how far behind the
// writer is.
type Flow struct {
	Accepted int64 `json:"accepted"`
	Bots     int64 `json:"bots"`
	Rejected int64 `json:"rejected"`
	Lag      int64 `json:"lag"` // records durable but not yet in DuckDB
}

// Store is disk: what is used, what is free, and how long that lasts at the
// rate this instance is actually writing.
type Store struct {
	Events    int64   `json:"events"`
	BytesUsed int64   `json:"bytes_used"`
	BytesFree int64   `json:"bytes_free"`
	DaysLeft  float64 `json:"days_left"`      // 0 when unknown
	PerDay    float64 `json:"events_per_day"` // average over the last 7 days
	PerEvent  float64 `json:"bytes_per_event"`
}

// Pay is the payment pipeline at a glance.
type Pay struct {
	Connections int   `json:"connections"`
	Pending     int   `json:"pending"`    // webhooks waiting to be processed
	LastEventAt int64 `json:"last_event"` // unix seconds
	LastSyncAt  int64 `json:"last_sync"`
}

// HealthSource is filled in by the server, which owns the pieces.
type HealthSource func(ctx context.Context) Health

func (a *API) health(w http.ResponseWriter, r *http.Request) {
	// The whole installation's numbers (every event, the disk, backups) are
	// the operator's, not any one customer's.
	if !principalOf(r).operator() {
		fail(w, http.StatusNotFound, "not found")
		return
	}
	if a.HealthOf == nil {
		fail(w, http.StatusServiceUnavailable, "health is not available")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	h := a.HealthOf(ctx)
	h.Memory, h.MemorySource = memoryUse()
	writeJSON(w, http.StatusOK, h)
}
