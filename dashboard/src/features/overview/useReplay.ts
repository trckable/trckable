// Replay plays the chart on screen: its points, by its own bucket (the hour
// when the chart is by the hour), from its own start (a new site's first
// visit). One clock drives it: the playhead is a position between the points
// that moves every frame (playhead.ts), and the page hears of a new point on
// a calmer cadence.
import { useCallback, useEffect, useRef, useState } from 'react'
import { playhead } from './playhead'
import { advance, commitAt, DEFAULT_SPEED, rateOf, SPEEDS, speedId } from './replayTime'

/** The point a replay starts on: where it was paused, else the chart's first. */
export function replayStart(first: number, at: number, n: number) {
  return at < first || at >= n - 1 ? first : at
}

const KEY = 'tkb_replay_speed'

/** How fast a replay runs, remembered in this browser (a private window simply starts at Normal). */
export function useSpeed(playing: boolean): [string, (id: string) => void] {
  const [speed, setSpeed] = useState(() => {
    try {
      return speedId(localStorage.getItem(KEY))
    } catch {
      return DEFAULT_SPEED
    }
  })
  const pick = useCallback((id: string) => {
    setSpeed(id)
    try {
      localStorage.setItem(KEY, id)
    } catch {
      /* storage blocked: the choice lasts until the page closes */
    }
  }, [])
  useSpeedKeys(playing, speed, pick)
  return [speed, pick]
}

/** [ and ] change the speed while a replay plays. */
function useSpeedKeys(playing: boolean, speed: string, pick: (id: string) => void) {
  useEffect(() => {
    if (!playing) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== '[' && e.key !== ']') || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return
      const i = SPEEDS.findIndex((s) => s.id === speed)
      const to = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + (e.key === ']' ? 1 : -1)))]
      if (to.id !== speed) pick(to.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playing, speed, pick])
}

type Run = { playing: boolean; secs: number; first: number; n: number; at: number; step: (i: number | null) => void; done: () => void; stops?: number[] }

/** The points a replay visits: every one from start, or, with reduced
 *  motion, only the moments (stops) from start on, then the end. */
export function replayPath(start: number, n: number, stops?: number[]): number[] {
  if (stops?.length) return [...new Set([start, ...stops.filter((i) => i > start && i < n), n - 1])]
  return Array.from({ length: Math.max(0, n - start) }, (_, k) => start + k)
}

const COMMIT_MS = 220 // how often the page's lists and cards move on a point
const HOLD_MS = 450 // the line stays complete a moment before the summary

// A replay is a race to the period's totals, so it finishes on them: after
// the last point, step(null) puts the whole period back. Returns settle(),
// for a pause: the page takes the point the playhead is nearest to.
export function useReplayTimer(run: Run) {
  const { playing, first, n, at } = run
  // The clock reads these every frame: a new speed changes the pace and
  // nothing else, so the playhead carries on from where it is.
  const live = useRef(run)
  useEffect(() => {
    live.current = run
  })
  useEffect(() => {
    if (!playing || n < 1) return
    const start = replayStart(first, at, n)
    // Reduced motion steps moment to moment, a pause on each, no glide.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const stops = live.current.stops
      const path = replayPath(start, n, stops?.length ? stops : undefined)
      const every = Math.max(stops?.length ? 700 : 120, (live.current.secs * 1000) / path.length)
      let k = 0
      live.current.step(path[0])
      const t = setInterval(() => {
        k++
        if (k >= path.length) {
          clearInterval(t)
          live.current.done()
          live.current.step(null)
          return
        }
        live.current.step(path[k])
      }, every)
      return () => clearInterval(t)
    }
    let pos = start
    let committed = start
    let prev = performance.now()
    let lastCommit = prev
    let raf = 0
    let hold: ReturnType<typeof setTimeout> | undefined
    live.current.step(start)
    playhead.set(pos - first)
    const frame = (now: number) => {
      const r = live.current
      pos = advance(pos, now - prev, rateOf(first, n, r.secs), n - 1)
      prev = now
      playhead.set(pos - first)
      const c = commitAt(pos, committed, r.stops, now - lastCommit, COMMIT_MS)
      if (c !== null) {
        committed = c
        lastCommit = now
        r.step(c)
      }
      if (pos < n - 1) {
        raf = requestAnimationFrame(frame)
        return
      }
      if (committed < n - 1) r.step(n - 1)
      hold = setTimeout(() => {
        live.current.done()
        live.current.step(null)
      }, HOLD_MS)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(hold)
    }
    // The clock restarts on play only: the speed, the moments and the point on
    // screen are read live, and would restart it every step.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [playing])
  return useCallback(() => {
    const p = playhead.get()
    if (p >= 0) live.current.step(Math.min(live.current.n - 1, Math.round(p + live.current.first)))
  }, [])
}
