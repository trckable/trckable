// The timing of a replay, as plain numbers. A speed is a duration for a
// period of a usual length; the period's own length scales it, so a week and
// a year both feel right. The playhead is a position between the chart's
// points that moves with the clock, never with a timer's ticks.

export interface Speed {
  id: string
  name: string
  /** Seconds a period of about REF points takes at this speed. */
  secs: number
}

export const SPEEDS: Speed[] = [
  { id: 'slow', name: 'Slow', secs: 40 },
  { id: 'normal', name: 'Normal', secs: 20 },
  { id: 'fast', name: 'Fast', secs: 10 },
  { id: 'faster', name: 'Faster', secs: 5 },
  { id: 'rapid', name: 'Rapid', secs: 2 },
]
export const DEFAULT_SPEED = 'normal'

const REF = 30
const MIN_SECS = 1.5
const MAX_SECS = 60

export const speedOf = (id: string): Speed => SPEEDS.find((s) => s.id === id) ?? SPEEDS[1]

/** Speeds saved before they were named: 1×, 2× and 4×. */
export function speedId(saved: string | null): string {
  if (saved && SPEEDS.some((s) => s.id === saved)) return saved
  return ({ '1': 'normal', '2': 'fast', '4': 'faster' } as Record<string, string>)[saved ?? ''] ?? DEFAULT_SPEED
}

/** How long a replay of this many points takes at a speed: the preset's
 *  duration, stretched or squeezed by the period's length (the square root
 *  of it, within limits), and never below a moment or above a minute. */
export function replaySeconds(points: number, secs: number): number {
  const scale = Math.min(1.6, Math.max(0.4, Math.sqrt(Math.max(1, points) / REF)))
  return Math.min(MAX_SECS, Math.max(MIN_SECS, secs * scale))
}

/** "~20 s" for the menu. */
export function fmtSecs(s: number): string {
  return `~${s < 10 ? Math.round(s * 2) / 2 : Math.round(s)} s`
}

/** The lists that race while Replay tells the period. */
export const RACE_DIMS = ['channel', 'entry_page', 'country', 'device']
