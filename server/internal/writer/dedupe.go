package writer

// dedupe remembers recently seen client event ids so that events retried by
// the tracker's queue (or double-sent via beacon + retry) count once.
//
// Two generations are kept and rotated, giving a window of between one and two
// rotation periods. The tracker's queue keeps events for at most 30 minutes, so
// rotating every 30 minutes covers every possible retry.
type dedupe struct {
	cur, prev  map[uint64]struct{}
	rotatedAt  int64 // ms
	periodMs   int64
	maxEntries int // rotate early under extreme load to bound memory
}

func newDedupe(periodMs int64, maxEntries int) *dedupe {
	return &dedupe{
		cur:        make(map[uint64]struct{}),
		prev:       make(map[uint64]struct{}),
		periodMs:   periodMs,
		maxEntries: maxEntries,
	}
}

// seen reports whether id was already recorded, recording it if not.
// id 0 means "no id" (server-side events) and is never deduplicated.
func (d *dedupe) seen(id uint64, now int64) bool {
	if id == 0 {
		return false
	}
	if d.rotatedAt == 0 {
		d.rotatedAt = now
	}
	if now-d.rotatedAt >= d.periodMs || len(d.cur) >= d.maxEntries {
		d.prev, d.cur = d.cur, make(map[uint64]struct{}, len(d.cur))
		d.rotatedAt = now
	}
	if _, ok := d.cur[id]; ok {
		return true
	}
	if _, ok := d.prev[id]; ok {
		return true
	}
	d.cur[id] = struct{}{}
	return false
}

func (d *dedupe) size() int { return len(d.cur) + len(d.prev) }
