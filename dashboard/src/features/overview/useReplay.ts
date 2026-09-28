// Replay plays the chart on screen: its points, by its own bucket (the hour
// when the chart is by the hour), from its own start (a new site's first
// visit), one point at a time.
import { useEffect, useState } from 'react'

/** Milliseconds per replayed point at 1×: long charts play faster. */
export function replayMs(points: number) {
  if (points > 60) return 90
  return points > 20 ? 200 : 480
}

/** The point a replay starts on: where it was paused, else the chart's first. */
export function replayStart(first: number, at: number, n: number) {
  return at < first || at >= n - 1 ? first : at
}

/** How fast a replay runs, remembered in this browser (a private window simply starts at 1×). */
export function useSpeed(): [number, (n: number) => void] {
  const [speed, setSpeed] = useState(() => {
    try {
      const v = Number(localStorage.getItem('tkb_replay_speed'))
      return [1, 2, 4].includes(v) ? v : 1
    } catch {
      return 1
    }
  })
  const pick = (n: number) => {
    setSpeed(n)
    try {
      localStorage.setItem('tkb_replay_speed', String(n))
    } catch {
      /* storage blocked: the choice lasts until the page closes */
    }
  }
  return [speed, pick]
}

type Run = { playing: boolean; speed: number; first: number; n: number; at: number; step: (i: number | null) => void; done: () => void; stops?: number[] }

/** The points a replay visits: every one from start, or, with reduced
 *  motion, only the moments (stops) from start on, then the end. */
export function replayPath(start: number, n: number, stops?: number[]): number[] {
  if (stops?.length) return [...new Set([start, ...stops.filter((i) => i > start && i < n), n - 1])]
  return Array.from({ length: Math.max(0, n - start) }, (_, k) => start + k)
}

// A replay is a race to the period's totals, so it finishes on them: after
// the last point, step(null) puts the whole period back.
export function useReplayTimer({ playing, speed, first, n, at, step, done, stops }: Run) {
  useEffect(() => {
    if (!playing || n < 1) return
    // Reduced motion steps moment to moment, a pause on each, no glide.
    const still = !!stops?.length && matchMedia('(prefers-reduced-motion: reduce)').matches
    const path = replayPath(replayStart(first, at, n), n, still ? stops : undefined)
    let k = 0
    step(path[0])
    const t = setInterval(() => {
      k++
      if (k >= path.length) {
        clearInterval(t)
        done()
        step(null)
        return
      }
      step(path[k])
    }, (still ? 1600 : replayMs(n - first)) / speed)
    return () => clearInterval(t)
    // A new speed picks up from the point on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restarts on play/speed only; the point moves every tick and would restart the timer each step
  }, [playing, speed])
}
