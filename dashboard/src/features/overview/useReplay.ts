// Replay plays the chart on screen: its points, by its own bucket (the hour
// when the chart is by the hour), from its own start (a new site's first
// visit). One clock drives it: the playhead is a position between the points
// that moves every frame (playhead.ts), and the page hears of a new point on
// a calmer cadence. The clock itself is in replayEngine, fetched when a replay
// starts (replayLoad).
import { useCallback, useEffect, useRef, useState } from 'react'
import { playhead } from './playhead'
import { DEFAULT_SPEED, SPEEDS, speedId } from './replayTime'
import { useReplayEngine } from './replayLoad'
import type { Run } from './replayEngine'

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

// Returns settle(), for a pause: the page takes the point the playhead is
// nearest to.
export function useReplayTimer(run: Run) {
  const { playing, n } = run
  const engine = useReplayEngine(playing)
  // The clock reads these every frame: a new speed changes the pace and
  // nothing else, so the playhead carries on from where it is.
  const live = useRef(run)
  useEffect(() => {
    live.current = run
  })
  useEffect(() => {
    if (!playing || n < 1 || !engine) return
    return engine.runClock(live)
    // The clock restarts on play only: the speed, the moments and the point on
    // screen are read live, and would restart it every step.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [playing, engine])
  return useCallback(() => {
    const p = playhead.get()
    if (p >= 0) live.current.step(Math.min(live.current.n - 1, Math.round(p + live.current.first)))
  }, [])
}
