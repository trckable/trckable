// The two periods a screen sets side by side, in words, exactly as the report reads them (lib/dashQuery.ts, api/report.go).
import { calendarPrevious, compareRange, diffDays, type ISODate, type Range } from '../../lib/dates'
import type { ViewState } from '../../lib/url'
import { rangeWords } from '../dayWords'
import { copy } from './copy'

export interface Periods {
  now: string
  was: string | null
  /** Why the two are not quite like for like; absent when they are. */
  note?: string
}

/** The chip's words for the other period: its dates, and that both stop at the same hour when they do. */
export function vsDates(view: Pick<ViewState, 'period' | 'compare' | 'cfrom' | 'cto'>, range: Range, today: ISODate): string | undefined {
  if (view.compare === 'none') return undefined
  const custom = view.cfrom && view.cto ? { from: view.cfrom, to: view.cto } : undefined
  const other = compareRange(range, view.compare, custom, view.period)
  if (!other) return undefined
  const sameHour = range.to >= today && view.compare === 'previous' && !calendarPrevious(view.period, range)
  const year = other.to.slice(0, 4) !== today.slice(0, 4) ? ` ${other.to.slice(0, 4)}` : ''
  return copy.vsDates(`${rangeWords(other, '')}${year}`, sameHour && range.from === range.to)
}

export function periodsOf(view: Pick<ViewState, 'period' | 'compare' | 'cfrom' | 'cto'>, range: Range, today: ISODate, time: string): Periods {
  const running = range.to >= today
  const upTo = (text: string, on: boolean) => (on ? `${text} to ${time}` : text)
  const now = upTo(rangeWords(range, ''), running)
  if (view.compare === 'none') return { now, was: null }
  const custom = view.cfrom && view.cto ? { from: view.cfrom, to: view.cto } : undefined
  const other = compareRange(range, view.compare, custom, view.period)
  if (!other) return { now, was: null }
  // Only the plain period before is cut at the same hour; the others read their last day whole.
  const sameHour = view.compare === 'previous' && !calendarPrevious(view.period, range)
  const was = upTo(rangeWords(other, ''), running && sameHour)
  const days = diffDays(range.from, range.to) + 1
  const otherDays = diffDays(other.from, other.to) + 1
  if (days !== otherDays) return { now, was, note: copy.daysAgainst(days, otherDays) }
  if (running && !sameHour) return { now, was, note: copy.unfinished }
  return { now, was }
}
