// The story's run: the line travels to each moment, eased in and out, and rests there while its caption is told, then
// goes on. The line is drawn by the shared clock (reveal.ts); with no moment to rest on it is one sweep.
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

/** The times (ms into the run) at which the line reaches each stop: the moments, then the end. */
export function arrivals(legs: Leg[]): number[] {
  let t = 0
  return legs.map((l) => {
    t += l.go
    const arrive = t
    t += l.rest
    return arrive
  })
}

/** Where `next` takes a run that is `ms` in: the arrival at the next moment, or the end (null) when none is left before it. */
export function nextStop(legs: Leg[], ms: number): number | null {
  const a = arrivals(legs)
  const k = a.findIndex((t) => t > ms + 1)
  return k < 0 || k === a.length - 1 ? null : a[k]
}

export interface Run {
  stop: () => void
  pause: () => void
  resume: () => void
  /** Goes to the next moment (the end when there is none); `false` when it ended the run. */
  next: () => boolean
}

/** Plays the legs on the shared clock, then hands back to the still chart and calls `done`. `stop` leaves it where it is. */
export function runLegs(legs: Leg[], done: () => void): Run {
  let t0 = performance.now()
  /** The run's own time while it waits (paused), else null. */
  let held: number | null = null
  let id = 0
  let over = false
  const finish = () => {
    over = true
    reveal.set(-1)
    done()
  }
  const frame = (now: number) => {
    const r = at(legs, now - t0)
    if (r.over) {
      finish()
      return
    }
    reveal.set(r.p)
    id = requestAnimationFrame(frame)
  }
  reveal.set(0)
  id = requestAnimationFrame(frame)
  return {
    stop() {
      over = true
      cancelAnimationFrame(id)
      reveal.set(-1)
    },
    pause() {
      if (over || held !== null) return
      held = performance.now() - t0
      cancelAnimationFrame(id)
    },
    resume() {
      if (over || held === null) return
      t0 = performance.now() - held
      held = null
      id = requestAnimationFrame(frame)
    },
    next() {
      if (over) return false
      const now = performance.now()
      const to = nextStop(legs, held ?? now - t0)
      if (to === null) {
        cancelAnimationFrame(id)
        finish()
        return false
      }
      if (held !== null) {
        held = to
        reveal.set(at(legs, to).p)
      } else t0 = now - to
      return true
    },
  }
}
