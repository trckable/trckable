// Channels as data: what each card shows, the header row, and the words for a connect that just came back. Pure.
// Nothing here adds one platform's views to another's: a play, a view and an impression are counted differently.
import type { ChannelCard, ChannelAccount, Channels, Platform } from './api'
import { PLATFORMS } from './api'
import { copy } from './copy'

/** `unknown`: nothing is held and the account needs connecting again, so no number is shown, not even a zero. */
export type CardState = 'empty' | 'waiting' | 'unknown' | 'ready'

export interface CardView {
  platform: Platform
  name: string
  state: CardState
  ready: boolean
  accounts: ChannelAccount[]
  views?: number
  /** The period before, absent when the history does not reach back that far. */
  previous?: number
  /** One value for each day from the first counted to the newest, a day with no row counting as none. */
  values: number[]
  /** What is wrong with the account that is worst off, as a copy key. */
  problem?: 'denied' | 'expired' | 'limited' | 'failed'
  from?: string
}

const ORDER = ['denied', 'expired', 'failed', 'limited'] as const

const worst = (accounts: ChannelAccount[]): CardView['problem'] => ORDER.find((p) => accounts.some((a) => a.error === p))

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000)
}

/** The values to draw: every day from the first one with a number to `through`. */
export function valuesOf(series: ChannelCard['series'], through: string): number[] {
  if (series.length === 0) return []
  const first = series[0].day
  const out = new Array<number>(Math.max(1, daysBetween(first, through) + 1)).fill(0)
  for (const s of series) {
    const i = daysBetween(first, s.day)
    if (i >= 0 && i < out.length) out[i] = s.views
  }
  return out
}

export function cardView(c: ChannelCard, through: string): CardView {
  const base = { platform: c.platform, name: copy.platform[c.platform], ready: c.ready, accounts: c.accounts, problem: worst(c.accounts), from: c.from }
  if (c.accounts.length === 0) return { ...base, state: 'empty', values: [] }
  if (c.views === undefined) return { ...base, state: base.problem === 'denied' || base.problem === 'expired' ? 'unknown' : 'waiting', values: [] }
  return { ...base, state: 'ready', views: c.views, previous: c.previous, values: valuesOf(c.series, through) }
}

export const cardsOf = (data: Channels): CardView[] => PLATFORMS.map((p) => data.platforms.find((c) => c.platform === p)).filter((c): c is ChannelCard => !!c).map((c) => cardView(c, data.through))

/** The header row: each platform's own views, and how many accounts are connected. No total across platforms. */
export function header(cards: CardView[]) {
  return {
    views: cards.filter((c) => c.state === 'ready').map((c) => ({ platform: c.platform, name: c.name, views: c.views ?? 0 })),
    accounts: cards.reduce((n, c) => n + c.accounts.length, 0),
  }
}

/** True while an account has not been read once: the section asks again soon. */
export const waiting = (cards: CardView[]) => cards.some((c) => c.state === 'waiting')

/** What the address says about a connect that just came back: a line to tell, and the address without those parts. */
export function flashOf(search: string): { text: string; kind: 'success' | 'error'; clean: string } | null {
  const q = new URLSearchParams(search)
  const platform = PLATFORMS.find((p) => p === q.get('channel'))
  if (!platform) return null
  const err = q.get('channel_error')
  const done = q.get('connected') === '1'
  q.delete('channel')
  q.delete('connected')
  q.delete('channel_error')
  const clean = q.toString()
  if (err) return { text: err === 'denied' ? copy.flash.denied : copy.flash.failed, kind: 'error', clean }
  return done ? { text: copy.connected(copy.platform[platform]), kind: 'success', clean } : null
}
