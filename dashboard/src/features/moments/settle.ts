// The card and the chart say one number for one moment. The card keeps the pins
// it was opened with (it outlives the chart redrawing: a new period, another
// bucket), so each is read again from what the chart says now: a pin the chart
// no longer has (its day is off screen) stays as it was opened, and has no
// marker to say otherwise. Pure: settle.test.ts.
import type { Open } from './open'
import type { Pin } from './pins'

export function settle(open: Open, live: Pin[] | null): Open {
  if (!live) return open
  const now = new Map(live.map((p) => [p.id, p]))
  const pins = open.pins.map((p) => now.get(p.id) ?? p)
  return pins.every((p, k) => p === open.pins[k]) ? open : { ...open, pins }
}
