// The Speed & uptime and AI & mentions cards' figures, as plain functions: the speed headline, how the last thirty days
// read, and the AI crawler count by assistant. Nothing here knows the browser; the hook reads, the cards show.
import type { CrawlerReport, WebVitals } from '../../lib/api'
import { MIN_VITALS } from '../../lib/api'
import { addDays, type ISODate } from '../../lib/dates'
import { dayStates, daysBetween, rowTotals, uptimeOf, type DayState } from '../../features/incidents/model'
import type { Incident } from '../../features/incidents/api'
import type { Mention, Source } from '../../features/mentions/api'

export const UPTIME_DAYS = 30

/** The page's loading time (LCP, seconds) when enough page views stand behind it; none otherwise. */
export function speedOf(v: WebVitals | null): number | null {
  if (!v || v.lcp_ms == null || (v.lcp_n ?? v.samples) < MIN_VITALS) return null
  return v.lcp_ms / 1000
}

export interface UptimeFigure {
  /** The share of the watched time the site answered; none while too little of it was watched. */
  pct: number | null
  /** Oldest first, one a day, the last being today. */
  days: DayState[]
}

/** The last thirty days of the incident record, as the share up and a colour for each day. */
export function uptimeFigure(list: Incident[], today: ISODate, tz: string, now: number, watchedSince: number, paused = 0): UptimeFigure | null {
  if (!watchedSince) return null
  const days = daysBetween(addDays(today, -(UPTIME_DAYS - 1)), today)
  const states = dayStates(list, days, tz, now, watchedSince)
  const t = rowTotals(list, UPTIME_DAYS, now, watchedSince, paused)
  const up = uptimeOf(t.span, t.seconds)
  return { pct: up?.pct ?? null, days: days.map((d) => states.get(d) ?? 'ok') }
}

/** The assistants that get a mark of their own, by the name the server gives their robots. */
export const ENGINES = [
  { name: 'OpenAI', mark: 'O' },
  { name: 'Perplexity', mark: 'P' },
  { name: 'Anthropic', mark: 'C' },
  { name: 'Google', mark: 'G' },
] as const

export interface AiFigure {
  hits: number
  /** The marked assistants that came, most hits first. */
  engines: { name: string; mark: string; hits: number }[]
}

/** The AI robots' hits (those that answer or train; search engines are not AI crawlers); none when none came. */
export function aiOf(r: CrawlerReport | null): AiFigure | null {
  if (!r) return null
  const hits = (r.kinds?.answer ?? 0) + (r.kinds?.train ?? 0)
  if (hits <= 0) return null
  const engines = ENGINES.map((e) => ({ ...e, hits: (r.series ?? []).filter((s) => s.name === e.name && s.kind !== 'index').reduce((n, s) => n + s.total, 0) }))
    .filter((e) => e.hits > 0)
    .sort((a, b) => b.hits - a.hits)
  return { hits, engines }
}

export interface MentionsFigure {
  n: number
  /** Where they were found, most first. */
  sources: Source[]
}

export function mentionsOf(list: Mention[]): MentionsFigure {
  const by = new Map<Source, number>()
  for (const m of list) by.set(m.source, (by.get(m.source) ?? 0) + 1)
  return { n: list.length, sources: [...by].sort((a, b) => b[1] - a[1]).map(([s]) => s) }
}
