// A site far busier than usual right now, as the server finds it (/surge): what
// it is in numbers, who sent most of them, and the filter that shows them. Pure
// parts here so surge.test.ts reads them; the card draws them (SurgeCard.tsx).
import type { Filter } from '../../lib/api'
import { call } from '../../lib/api'
import { addDays, todayIn, type ISODate } from '../../lib/dates'
import type { ViewState } from '../../lib/url'
import { times } from '../../lib/times'
import { signals } from './copy'

export interface Surge {
  id: string
  started: number
  /** Unix seconds the busy moment ended; 0 or absent while it lasts. */
  ended?: number
  online: number
  usual: number
  times: number
  story?: Story
  why: {
    source?: string
    source_dim?: 'referrer' | 'channel'
    source_value?: string
    source_n?: number
    source_usual: number
    campaign?: string
    page?: string
    page_n?: number
    country?: string
    country_n?: number
    before: number
    minutes: number
  }
}

/** How it went, from the last hour's counts (the server's story). */
export interface Story {
  /** Unix seconds the last slice ends: when it was told. */
  at: number
  series: number[]
  step: number
  start?: number
  peak: number
  peak_at: number
  now: number
  mobile?: number
  devices?: number
  countries?: { country: string; n: number }[]
  sources?: { name: string; n: number }[]
  pages?: { name: string; n: number }[]
}

export const surgeApi = {
  now: (site: string, signal?: AbortSignal) => call<{ surge: Surge | null }>('GET', `/sites/${site}/surge`, undefined, signal, true).then((r) => r.surge),
  /** A busy moment that began at `started`, over or not, with a chart of its own window drawn from the stored counts. */
  near: (site: string, started: number, signal?: AbortSignal) => call<{ surge: Surge | null }>('GET', `/sites/${site}/surges/near?t=${started}`, undefined, signal, true).then((r) => r.surge),
}

const t = signals.surge

/** The filter "See it" applies: the source that sent most of them. */
export function surgeFilter(s: Surge): Filter | null {
  const { source_dim: dim, source_value: value } = s.why
  return dim && value ? { dim, value } : null
}

/** Whether the source holds most of the people online. */
const most = (s: Surge) => !!s.why.source_n && s.why.source_n * 2 > s.online

/** The card's one line about who sent them: "Mostly from Facebook", or how many when it is not most. Empty with no source. */
export function sourceLine(s: Surge): string {
  const w = s.why
  if (!w.source || !w.source_n) return ''
  const direct = w.source_dim === 'channel' && w.source === 'Direct'
  if (direct) return most(s) ? t.mostlyDirect : t.someDirect(w.source_n)
  return most(s) ? t.mostly(w.source) : t.some(w.source_n, w.source)
}

/** The referring host whose icon sits beside the line, when the source is one. */
/** Link-shim and mobile prefixes (l., m., lm.) are left off: l.facebook.com is Facebook's own icon and initial. */
export const sourceHost = (s: Surge): string | null => (s.why.source_dim === 'referrer' && s.why.source_value ? s.why.source_value.replace(/^(www|l|m|lm|mobile|out)\./, '') : null)

/** The chip: how many times the usual. */
export const surgeChip = (s: Surge) => t.chip(times(s.times))

/** The browser notice: "mostly" only when the source really has most of them. */
export function surgeNotice(s: Surge, domain: string): { title: string; body: string } {
  return { title: t.noticeTitle(s.online, most(s) ? (s.why.source ?? '') : ''), body: t.noticeBody(domain) }
}

/** A time of day in the site's own zone: "18:40". */
export function clock(unix: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(unix * 1000)
  } catch {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(unix * 1000)
  }
}

/** The index of the slice the climb began in, to mark on the shape; none when it began before the hour. */
export function startSlice(story: Story): number | undefined {
  if (!story.start) return undefined
  const i = story.series.length - Math.round((story.at - story.start) / (story.step * 60))
  return i >= 0 && i < story.series.length ? i : undefined
}

/** The index of the busiest slice (the first, when several tie). */
export function peakSlice(story: Story): number {
  return story.series.indexOf(Math.max(...story.series))
}

export interface Beat {
  key: 'start' | 'peak' | 'now'
  text: string
}

/** The story as beats, in time order: when it began and from where, the peak, now. */
export function beats(s: Surge, tz: string): Beat[] {
  const st = s.story
  if (!st) return []
  const from = s.why.source ?? ''
  const out: Beat[] = [{ key: 'start', text: st.start ? t.beatStart(clock(st.start, tz), from) : t.beatLonger }]
  out.push({ key: 'peak', text: t.beatPeak(clock(st.peak_at, tz), st.peak) })
  // A moment that is over has no "now": its chart ends where its window does.
  if (!s.ended) out.push({ key: 'now', text: t.beatNow(st.now) })
  return out
}

/** The honest sentence: "looks like", never a cause, and the exact post is not claimed. */
export function honestLine(s: Surge): string {
  const w = s.why
  if (w.source && w.source_dim === 'referrer') return t.startedFrom(w.source)
  return t.startedNoSource
}

/** A path that fits one line whole; a longer one keeps its start and its tail with an ellipsis between: "/news/raimonda-sino-plani…-2024". */
export function midTruncate(path: string, max = 34): string {
  if (path.length <= max) return path
  const head = Math.ceil((max - 1) * 0.6)
  return `${path.slice(0, head)}…${path.slice(path.length - (max - 1 - head))}`
}

/** Phones against computers, as whole percents of the people whose device is known; null under five of them. */
export function deviceShare(st: Story): { phone: number; computer: number } | null {
  const known = st.devices ?? 0
  if (known < 5) return null
  const phone = Math.round(((st.mobile ?? 0) * 100) / known)
  return { phone, computer: 100 - phone }
}

const HALF_HOUR = 30 * 60

/** The site's own day and hour of a moment, as the hourly chart names its buckets: "2026-09-22" and "2026-09-22T12:00". */
export function localHour(unix: number, tz: string): { day: ISODate; hour: string } {
  let parts: Record<string, string>
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(unix * 1000).map((p) => [p.type, p.value]))
  } catch {
    return localHour(unix, 'UTC')
  }
  const day = `${parts.year}-${parts.month}-${parts.day}`
  return { day, hour: `${day}T${parts.hour}:00` }
}

/**
 * What "See it in Data" does to the address: the day or days around the moment (half an hour before
 * it began to half an hour after it ended, or now while it lasts), by the hour, against the same days
 * a week earlier (the usual is the same hour of the same weekday), opened on the numbers. No filter is
 * applied: the other traffic stays in view, and the page offers the source as a chip.
 */
export function seeInData(s: Surge, tz: string, now = new Date()): Partial<ViewState> {
  const today = todayIn(tz, now)
  const from = localHour(s.started - HALF_HOUR, tz).day
  const end = s.ended ? Math.min(s.ended + HALF_HOUR, Math.floor(now.getTime() / 1000)) : Math.floor(now.getTime() / 1000)
  const to = localHour(end, tz).day
  const last = to > today ? today : to
  return { live: false, period: 'custom', from, to: last, bucket: 'hour', compare: 'custom', cfrom: addDays(from, -7), cto: addDays(last, -7), filters: [], day: undefined, v: 'explore', story: undefined, surge: s.started }
}

/** What "See it in Data" does from the landing page chip: the same moment, filtered to that page. */
export const seePageInData = (s: Surge, tz: string, page: string, now = new Date()): Partial<ViewState> => ({ ...seeInData(s, tz, now), filters: [{ dim: 'page', value: page }] })

/** The line over the numbers: when it was, how busy, who sent them and where they landed. */
export function bannerLine(s: Surge, tz: string): string {
  const from = clock(s.started, tz)
  const span = s.ended ? t.spanBetween(from, clock(s.ended, tz)) : t.spanSince(from)
  const w = s.why
  return [t.bannerHead(span), t.atPeak(s.online), w.source ? t.fromSource(w.source) : ''].filter(Boolean).join(' · ')
}
