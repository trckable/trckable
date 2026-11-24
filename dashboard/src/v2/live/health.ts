// The Speed & uptime and AI cards' figures, as plain functions: the speed headline, how the last thirty days
// read, and the AI crawler count by assistant. Nothing here knows the browser; the hook reads, the cards show.
import type { CrawlerReport, WebVitals } from '../../lib/api'
import { MIN_VITALS } from '../../lib/api'
import { addDays, type ISODate } from '../../lib/dates'
import { dayStates, daysBetween, rowTotals, uptimeOf, type DayState } from '../../features/incidents/model'
import type { Incident, PausedSpan } from '../../features/incidents/api'
import { copy as briefing } from '../briefing/copy'

export const UPTIME_DAYS = 30

/** The loading-time bands of each figure, in seconds: where "fast" ends, where "OK" ends, and the far end of the gauge. */
export const BANDS = { lcp: [2.5, 4, 5], fcp: [1.8, 3, 3.6] } as const

export interface Speed {
  /** Which paint the figure is: the main content (LCP), or, where too few browsers report that, the first content (FCP). */
  kind: 'lcp' | 'fcp'
  /** Seconds, once at least MIN_VITALS readings stand behind it; none before. */
  sec: number | null
  /** The readings behind the figure, or, with none yet, how many have come in. */
  n: number
  /** Different people who visited in the window. */
  people: number
}

/** The grade of a loading time against its own bands. */
export const speedGrade = (kind: Speed['kind'], sec: number): 'good' | 'mid' | 'poor' => {
  const [good, mid] = BANDS[kind]
  if (sec <= good) return 'good'
  return sec <= mid ? 'mid' : 'poor'
}

/** The page's loading time: the main content (LCP) when enough page views report it, else the first content (FCP) when enough do; else the count so far. */
export function speedOf(v: WebVitals | null): Speed | null {
  if (!v) return null
  const people = v.people ?? 0
  const lcpN = v.lcp_n ?? v.samples
  if (v.lcp_ms != null && lcpN >= MIN_VITALS) return { kind: 'lcp', sec: v.lcp_ms / 1000, n: lcpN, people }
  const fcpN = v.fcp_n ?? 0
  if (v.fcp_ms != null && fcpN >= MIN_VITALS) return { kind: 'fcp', sec: v.fcp_ms / 1000, n: fcpN, people }
  return { kind: 'lcp', sec: null, n: lcpN, people }
}

/** What Live says while the check is paused: the Briefing's words, so the two never differ. */
export const pausedWords = briefing.checksPaused

export interface UptimeFigure {
  /** The share of the watched time the site answered; none while too little of it was watched. */
  pct: number | null
  /** Oldest first, one a day, the last being today. */
  days: DayState[]
}

/** The last thirty days of the incident record, as the share up and a colour for each day. */
export function uptimeFigure(list: Incident[], today: ISODate, tz: string, now: number, watchedSince: number, paused = 0, pausedSpans: PausedSpan[] = []): UptimeFigure | null {
  if (!watchedSince) return null
  const days = daysBetween(addDays(today, -(UPTIME_DAYS - 1)), today)
  const states = dayStates(list, days, tz, now, watchedSince, pausedSpans)
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
