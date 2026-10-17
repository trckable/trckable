// The clock of a replay: how far the line has been drawn, from 0 to 1, -1 when nothing plays. One run takes about
// three seconds, eased, whatever the period. The frame loop only writes the number here; the chart and the rail read
// it and move themselves straight on their elements, so a frame never re-renders the page.
import { useSyncExternalStore } from 'react'

let pos = -1
const subs = new Set<() => void>()

export const reveal = {
  get: () => pos,
  set(p: number) {
    pos = p
    subs.forEach((f) => f())
  },
  subscribe(f: () => void) {
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  },
}

export const REPLAY_MS = 2800

const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const out = (t: number) => 1 - Math.pow(1 - t, 3)

/** Plays from `from` (0 at the start) to the end, then hands back to the still chart and calls `done`. The returned function stops it where it is. */
export function runReveal(from: number, done: () => void): () => void {
  const ms = REPLAY_MS * (1 - from)
  const t0 = performance.now()
  let id = 0
  const frame = (now: number) => {
    const t = Math.min(1, (now - t0) / ms)
    if (t >= 1) {
      reveal.set(-1)
      done()
      return
    }
    reveal.set(from + (1 - from) * (from > 0 ? out(t) : inOut(t)))
    id = requestAnimationFrame(frame)
  }
  reveal.set(from)
  id = requestAnimationFrame(frame)
  return () => {
    cancelAnimationFrame(id)
    reveal.set(-1)
  }
}

/** The point of `n` the line has reached, or -1; the caller re-renders only when the point changes. */
export function usePoint(n: number): number {
  return useSyncExternalStore((f) => reveal.subscribe(f), () => (reveal.get() < 0 || n < 2 ? -1 : Math.min(n - 1, Math.floor(reveal.get() * (n - 1) + 1e-9))))
}
