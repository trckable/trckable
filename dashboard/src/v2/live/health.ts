// The Health strip's figures, as plain functions: the speed headline, how the last sixteen days of uptime read, and the
// AI crawler count. Nothing here knows the browser; the hook reads, the strip shows.
import type { CrawlerReport, WebVitals } from '../../lib/api'
import { MIN_VITALS } from '../../lib/api'
import { addDays, type ISODate } from '../../lib/dates'
import { dayStates, daysBetween, rowTotals, uptimeOf, MIN_WATCH, type DayState } from '../../features/incidents/model'
import type { Incident } from '../../features/incidents/api'

export const UPTIME_DAYS = 16

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

/** The last sixteen days of the incident record, as the share up and a colour for each day. */
export function uptimeFigure(list: Incident[], today: ISODate, tz: string, now: number, watchedSince: number): UptimeFigure | null {
  if (!watchedSince) return null
  const days = daysBetween(addDays(today, -(UPTIME_DAYS - 1)), today)
  const states = dayStates(list, days, tz, now, watchedSince)
  const t = rowTotals(list, UPTIME_DAYS, now, watchedSince)
  const up = uptimeOf(t.span, t.seconds)
  return { pct: up?.pct ?? null, days: days.map((d) => states.get(d) ?? 'ok') }
}

/** Whether the watch is long enough to say anything about the sixteen days. */
export const watchedLongEnough = (watchedSince: number, now: number): boolean => watchedSince > 0 && now - watchedSince >= MIN_WATCH

export interface AiFigure {
  hits: number
  /** Of them, the ones an assistant fetched to answer someone. */
  answers: number
}

/** The AI robots' hits (those that answer or train; search engines are not AI crawlers); none when none came. */
export function aiOf(r: CrawlerReport | null): AiFigure | null {
  if (!r) return null
  const answers = r.kinds?.answer ?? 0
  const hits = answers + (r.kinds?.train ?? 0)
  return hits > 0 ? { hits, answers } : null
}
