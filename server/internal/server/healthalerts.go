package server

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"github.com/trckable/trckable/server/internal/alerts"
)

// The installation's own problems, the ones Settings → Health shows in red.
// Shown only, they wait for someone to open the page; each is also sent to the
// operator's alert destination, once when it starts and once when it clears.
const (
	problemBackup  = "backup"  // the last backup could not be written
	problemOffsite = "offsite" // the last copy to the bucket failed
	problemIngest  = "ingest"  // the write-ahead log refuses events
	problemKey     = "key"     // the instance key is not the one the data was sealed with
)

var problemOrder = []string{problemBackup, problemOffsite, problemIngest, problemKey}

// healthEvery is how often the problems are looked at. It reads what the
// server already holds in memory and a file on disk, so it costs nothing;
// the database is only asked when something changed.
const healthEvery = time.Minute

// healthClearAfter is how many clean checks in a row count as "cleared". The
// write-ahead log lets one append try again every 30 seconds while the disk is
// full, so a single clean look can be that gap, not a fix.
const healthClearAfter = 5

// runHealthAlerts sends the installation's problems as they start and clear.
func (s *Server) runHealthAlerts(ctx context.Context) {
	h := &healthAlerter{
		state:   s.ctl,
		targets: s.ctl.OperatorTargets,
		send:    alerts.Send,
		now:     time.Now,
		domain:  baseHost(s.cfg.BaseURL),
	}
	t := time.NewTicker(healthEvery)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		h.check(ctx, s.problems())
	}
}

// problems returns each problem present right now, with what went wrong.
func (s *Server) problems() map[string]string {
	out := map[string]string{}
	if f := s.backupErr.Load(); f != nil {
		out[problemBackup] = f.err
	} else if b, err := os.ReadFile(filepath.Join(s.backupsDir(), FailedFile)); err == nil {
		// The failure is kept on disk until a backup works, so a restart
		// neither forgets it nor reports it fixed.
		out[problemBackup] = string(b)
	}
	if s.remote != nil {
		if st := s.offsite.Load(); st != nil && st.err != "" {
			out[problemOffsite] = st.err
		}
	}
	if s.log != nil {
		if err := s.log.Err(); err != nil {
			out[problemIngest] = err.Error()
		}
	}
	if s.revenue != nil && s.revenue.KeyMismatch() {
		out[problemKey] = "TRCKABLE_SECRET does not match the key this data was encrypted with"
	}
	return out
}

// metaStore keeps which problems have been sent, in the control database, so
// a restart during a problem does not send it a second time.
type metaStore interface {
	Meta(ctx context.Context, key string) (string, bool, error)
	SetMeta(ctx context.Context, key, value string) error
	DeleteMeta(ctx context.Context, key string) error
}

// healthAlerter turns problems into one message when each starts and one when
// it clears.
type healthAlerter struct {
	state   metaStore
	targets func(ctx context.Context) ([]string, error)
	send    func(ctx context.Context, target string, e alerts.Event) error
	now     func() time.Time
	domain  string
	clean   map[string]int // clean checks in a row, per problem already sent
}

func sentKey(problem string) string { return "health_alert_" + problem }

// check compares the problems now with what was sent before and sends the
// difference.
func (h *healthAlerter) check(ctx context.Context, now map[string]string) {
	if h.clean == nil {
		h.clean = map[string]int{}
	}
	type change struct {
		problem string
		started bool
	}
	var changes []change
	for _, p := range problemOrder {
		_, sent, err := h.state.Meta(ctx, sentKey(p))
		if err != nil {
			slog.Warn("health alert state unreadable", "err", err)
			return
		}
		_, active := now[p]
		switch {
		case active:
			h.clean[p] = 0
			if !sent {
				changes = append(changes, change{p, true})
			}
		case sent:
			h.clean[p]++
			if h.clean[p] >= healthClearAfter {
				changes = append(changes, change{p, false})
			}
		}
	}
	if len(changes) == 0 {
		return
	}
	targets, err := h.targets(ctx)
	if err != nil {
		slog.Warn("health alert destinations unreadable", "err", err)
		return
	}
	for _, c := range changes {
		key := sentKey(c.problem)
		if len(targets) == 0 {
			// Nobody to tell. What was sent is forgotten, so a destination
			// added later hears about a problem that is still there, and
			// never about one that ended while it did not exist.
			if !c.started {
				h.state.DeleteMeta(ctx, key)
				delete(h.clean, c.problem)
			}
			continue
		}
		ev := healthEvent(c.problem, now[c.problem], c.started, h.now())
		ev.Domain = h.domain
		delivered := false
		for _, t := range targets {
			if err := h.send(ctx, t, ev); err != nil {
				slog.Warn("health alert not delivered", "problem", c.problem, "err", err)
				continue
			}
			delivered = true
		}
		// Recorded only once someone was told: a failed delivery is tried
		// again at the next check, not lost.
		if !delivered {
			continue
		}
		if c.started {
			h.state.SetMeta(ctx, key, fmt.Sprint(h.now().Unix()))
		} else {
			h.state.DeleteMeta(ctx, key)
			delete(h.clean, c.problem)
		}
		slog.Info("health alert sent", "problem", c.problem, "started", c.started)
	}
}

// healthEvent is the message for one problem starting or clearing.
func healthEvent(problem, detail string, started bool, at time.Time) alerts.Event {
	ev := alerts.Event{Kind: "health", At: at, Data: map[string]any{"problem": problem, "state": "cleared"}}
	if started {
		ev.Data["state"] = "started"
	}
	switch problem {
	case problemBackup:
		if started {
			ev.Title, ev.Message = "Backup failed", "The daily backup could not be written: "+detail+"."
		} else {
			ev.Title, ev.Message = "Backups work again", "A backup was written."
		}
	case problemOffsite:
		if started {
			ev.Title, ev.Message = "Off-site copy failed", "The backup could not be copied to the bucket: "+detail+". Meanwhile the last seven backups stay on this machine."
		} else {
			ev.Title, ev.Message = "Off-site copies work again", "A backup was copied to the bucket."
		}
	case problemIngest:
		if started {
			ev.Title, ev.Message = "Events are refused", "The write-ahead log refuses new events: "+detail+". Trackers keep what they could not send and try again."
		} else {
			ev.Title, ev.Message = "Events are accepted again", "The write-ahead log takes events again."
		}
	case problemKey:
		if started {
			ev.Title, ev.Message = "The instance key does not match", detail+". Payments are paused and webhooks answer 503: start the server with the original key, or use Start over under Payments."
		} else {
			ev.Title, ev.Message = "The instance key matches again", "Payments are running again."
		}
	}
	return ev
}

// baseHost names the installation in a message (the domain it is served on),
// or nothing when it has no public address set.
func baseHost(base string) string {
	u, err := url.Parse(base)
	if err != nil {
		return ""
	}
	return u.Host
}
