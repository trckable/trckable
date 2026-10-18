// The story's run: the line travels to each moment, eased in and out, and rests there while its caption is told, then
// goes on. The same clock as every replay (reveal.ts), so the chart is drawn by the same code; only the pace differs.
import { reveal } from './reveal'

export interface Leg {
  from: number
  to: number
  /** Time of travel, then of rest at the end of it, in ms. */
  go: number
  rest: number
}

/** Moments are at `pos` (0 to 1, in order): the legs from the left edge to each of them, and on to the end. */
export function legsOf(pos: number[], travel = 3400, rest = 1000, least = 380): Leg[] {
  const stops = [...pos, 1]
  const legs: Leg[] = []
  let at = 0
  for (const [k, to] of stops.entries()) {
    const last = k === stops.length - 1
    legs.push({ from: at, to, go: to > at ? Math.max(least, travel * (to - at)) : 0, rest: last ? 0 : rest })
    at = to
  }
  return legs
}

export const runMs = (legs: Leg[]) => legs.reduce((a, l) => a + l.go + l.rest, 0)

const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** Where the line is `t` ms into the run (and whether it is over). */
export function at(legs: Leg[], ms: number): { p: number; over: boolean } {
  // A first frame can carry a time from just before the run began.
  const t = Math.max(0, ms)
  if (t >= runMs(legs) - 1e-6) return { p: 1, over: true }
  let left = t
  for (const l of legs) {
    if (left < l.go) return { p: l.from + (l.to - l.from) * inOut(left / l.go), over: false }
    left -= l.go
    if (left < l.rest) return { p: l.to, over: false }
    left -= l.rest
  }
  return { p: 1, over: true }
}

/** Plays the legs on the shared clock, then hands back to the still chart and calls `done`. The returned function stops it where it is. */
export function runLegs(legs: Leg[], done: () => void): () => void {
  const t0 = performance.now()
  let id = 0
  const frame = (now: number) => {
    const r = at(legs, now - t0)
    if (r.over) {
      reveal.set(-1)
      done()
      return
    }
    reveal.set(r.p)
    id = requestAnimationFrame(frame)
  }
  reveal.set(0)
  id = requestAnimationFrame(frame)
  return () => {
    cancelAnimationFrame(id)
    reveal.set(-1)
  }
}
