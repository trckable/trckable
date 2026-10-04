// A site far busier than usual right now, as the server finds it (/surge): what
// it is in numbers, who sent most of them, and the filter that shows them. Pure
// parts here so surge.test.ts reads them; the card draws them (SurgeCard.tsx).
import type { Filter } from '../../lib/api'
import { call } from '../../lib/api'
import { times } from '../../lib/times'
import { signals } from './copy'

export interface Surge {
  id: string
  started: number
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
}

export const surgeApi = {
  now: (site: string, signal?: AbortSignal) => call<{ surge: Surge | null }>('GET', `/sites/${site}/surge`, undefined, signal, true).then((r) => r.surge),
}

const t = signals.surge

/** The filter "See it" applies: the source that sent most of them. */
export function surgeFilter(s: Surge): Filter | null {
  const { source_dim: dim, source_value: value } = s.why
  return dim && value ? { dim, value } : null
}

/** The card's lines, each only when it is a real number: the source, the page, the campaign, a country that holds most, the jump. */
export function surgeLines(s: Surge): string[] {
  const w = s.why
  const lines: string[] = []
  if (w.source && w.source_n) {
    const usual = t.usually(Math.round(w.source_usual))
    lines.push(w.source_dim === 'channel' && w.source === 'Direct' ? t.direct(w.source_n, usual) : t.from(w.source_n, w.source, usual))
  }
  if (w.page) lines.push(t.page(w.page))
  if (w.campaign) lines.push(t.campaign(w.campaign))
  if (w.country) lines.push(t.country(w.country))
  if (w.minutes > 0 && w.before < s.online) lines.push(t.jump(w.before, s.online, w.minutes))
  return lines
}

/** The headline figure: how many are on and how many times the usual. */
export const surgeNow = (s: Surge) => t.now(s.online, times(s.times))

/** The browser notice: "mostly" only when the source really has most of them. */
export function surgeNotice(s: Surge, domain: string): { title: string; body: string } {
  const most = s.why.source && s.why.source_n && s.why.source_n * 2 > s.online ? s.why.source : ''
  return { title: t.noticeTitle(s.online, most), body: t.noticeBody(domain) }
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

/** The story in lines: when it began and from where, the peak and now, who. Real counts only; "looks like" for the link, and it says when the exact post cannot be seen. */
export function storyLines(s: Surge, tz: string, countryName: (code: string) => string): string[] {
  const st = s.story
  if (!st) return []
  const w = s.why
  const lines: string[] = []
  if (!st.start) lines.push(t.longer)
  else if (w.source && w.source_dim === 'referrer') lines.push(t.startedFrom(w.source, clock(st.start, tz), w.page ?? '', true))
  else lines.push(t.started(clock(st.start, tz)))
  lines.push(t.peak(st.peak, clock(st.peak_at, tz), st.now))
  const known = st.devices ?? 0
  if (known >= 5) {
    const phones = Math.round(((st.mobile ?? 0) * 100) / known)
    if (phones >= 60) lines.push(t.phones(phones))
    else if (phones <= 40) lines.push(t.desktops(100 - phones))
  }
  if (st.countries?.length) lines.push(t.countries(st.countries.map((c) => `${countryName(c.country)} ${c.n}`).join(', ')))
  return lines
}
