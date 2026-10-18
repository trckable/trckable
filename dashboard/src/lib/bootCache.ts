// What a refresh needs to paint the dashboard's own boxes before anything is asked: the sites' names, whether
// each has had a visit (Live opens first for one that has), whether Ask has its place in the header, and how
// tall the story's boxes were at this window's width (their heights depend on the words and on what is done). Kept in
// this browser only, best effort (private mode or blocked storage: nothing is kept, the ghost shows instead).
// public/theme.js reads it before the first paint; forgotten at sign-out, so another person's names never show.
import { useEffect } from 'react'
import type { Site } from './api'
import { can } from './permissions'

const KEY = 'trckable:boot'

const read = (): Record<string, unknown> => {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? 'null') as Record<string, unknown> | null) ?? {}
  } catch {
    return {}
  }
}

const write = (next: Record<string, unknown>) => {
  try {
    const kept = JSON.stringify(next)
    if (localStorage.getItem(KEY) !== kept) localStorage.setItem(KEY, kept)
  } catch {
    /* storage blocked: nothing is kept */
  }
}

export function keepBoot(sites: Site[]) {
  write({ ...read(), s: sites.map((s) => ({ d: s.domain, n: s.name, e: s.last_event_at ? 1 : 0 })), k: can('peek.ask') ? 1 : 0 })
}

/** The boxes of the story: how tall each was (px) at this window width. */
export interface Shape {
  head: number
  /** The setup card above the headline; 0 when there is none. */
  setup: number
  tile: number
  chart: number
  answers: number[]
}

export function keepShape(s: Shape) {
  write({ ...read(), h: s.head, u: s.setup, t: s.tile, c: s.chart, a: s.answers, w: innerWidth })
}

export function forgetBoot() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* storage blocked */
  }
}

/** Keeps the site list while signed in, forgets it once nobody is, and takes the first-paint shape off <html> when the app has taken over. */
export function useBootCache(state: string, sites?: Site[]) {
  useEffect(() => {
    if (state === 'ready' && sites) keepBoot(sites)
    if (state === 'login' || state === 'setup') forgetBoot()
    if (state !== 'loading') delete document.documentElement.dataset.boot
  }, [state, sites])
}
