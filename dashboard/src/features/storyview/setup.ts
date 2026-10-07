// The setup card's logic: which of the four first steps are done, which is
// next, and when the card was put off. Steps tick from real data; "Later" is
// kept in this browser (there is no per-user setting on the server), and a
// browser that will not store it just shows the card again, never throws.
import type { Site } from '../../lib/api'

export type SetupKey = 'snippet' | 'verify' | 'goal' | 'revenue'

export interface SetupStep {
  key: SetupKey
  done: boolean
}

export interface SetupInput {
  site: Pick<Site, 'last_event_at' | 'check'>
  /** A goal exists (a counted sign-up or sale). */
  goals: boolean
  /** A payment provider is connected. */
  revenue: boolean
}

/** The four steps in order, each ticked from what the site already shows. */
export function setupSteps(i: SetupInput): SetupStep[] {
  const seen = !!i.site.last_event_at
  return [
    { key: 'snippet', done: seen || i.site.check?.found === 'site' },
    { key: 'verify', done: seen },
    { key: 'goal', done: i.goals },
    { key: 'revenue', done: i.revenue },
  ]
}

/** The first step still open, or none when everything is done. */
export const nextStep = (steps: SetupStep[]): SetupKey | undefined => steps.find((s) => !s.done)?.key

export const DAY_MS = 86_400_000
/** How long "Later" hides the card. */
export const LATER_MS = 7 * DAY_MS

interface Later {
  /** Hidden until this time (ms). */
  until: number
  /** How many times it was put off. */
  n: number
}

const key = (site: string) => `trckable:setup:${site}`

function read(site: string): Later | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(key(site)) ?? 'null') as Partial<Later> | null
    if (v && typeof v.until === 'number' && typeof v.n === 'number') return { until: v.until, n: v.n }
  } catch {
    /* unreadable: as if never put off */
  }
  return undefined
}

/** Whether the card may show now: never put off, or put off once and the week is over. */
export function setupVisible(site: string, now = Date.now()): boolean {
  const l = read(site)
  if (!l) return true
  if (l.n >= 2) return false
  return now >= l.until
}

/** Puts the card off for a week; the second time it stays away. */
export function putOff(site: string, now = Date.now()) {
  const n = (read(site)?.n ?? 0) + 1
  try {
    localStorage.setItem(key(site), JSON.stringify({ until: now + LATER_MS, n }))
  } catch {
    /* private mode: put off for this page only */
  }
}
