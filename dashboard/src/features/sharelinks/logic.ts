// What the new-link form sends, and the checks the server makes again: the
// server has the last word, these only keep a mistake from costing a round trip.
import type { Share } from '../../lib/api'
import { copy } from './copy'

export type Expiry = 'never' | '7' | '30' | 'date'
export type Access = 'public' | 'password'

export interface Draft {
  name: string
  access: Access
  password: string
  revenue: boolean
  notes: boolean
  expiry: Expiry
  /** yyyy-mm-dd, from the date field */
  date: string
  embed: boolean
  sites: string
}

export const EMPTY: Draft = { name: '', access: 'public', password: '', revenue: false, notes: false, expiry: 'never', date: '', embed: false, sites: '' }

/** The most days the server accepts. */
export const MAX_DAYS = 3650
/** The most sites one link can be embedded on. */
export const MAX_SITES = 5

const DAY = 86_400_000

/** Whole calendar days from today to a picked day, on the viewer's clock;
 *  null when the day is not in the future or is more than ten years away. */
export function daysUntil(date: string, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return null
  const picked = Date.UTC(+m[1], +m[2] - 1, +m[3])
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((picked - today) / DAY)
  return days >= 1 && days <= MAX_DAYS ? days : null
}

/** Days the server should count, or null when the chosen day is not usable. */
export function expiryDays(d: Pick<Draft, 'expiry' | 'date'>, now = new Date()): number | null {
  if (d.expiry === 'never') return 0
  if (d.expiry === 'date') return daysUntil(d.date, now)
  return Number(d.expiry)
}

/** The day a link made now with this many days ends. */
export const endDate = (days: number, now = new Date()) => new Date(now.getTime() + days * DAY)

export interface Origins {
  list: string[]
  /** The first entry that is not a site address. */
  bad?: string
  tooMany?: boolean
}

/** The server's rule: an origin each, https (http only for localhost), no
 *  path, no query, no sign-in part. Split on spaces and commas. */
export function parseOrigins(text: string): Origins {
  const list: string[] = []
  for (const raw of text.split(/[\s,]+/)) {
    const s = raw.replace(/\/+$/, '')
    if (!s) continue
    let u: URL
    try {
      u = new URL(s)
    } catch {
      return { list, bad: raw }
    }
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    const scheme = u.protocol === 'https:' || (u.protocol === 'http:' && local)
    // Only a host, and a port: no path, no query, nothing before the host.
    const plain = /^https?:\/\/[^/?#@]+(#.*)?$/.test(s)
    if (!scheme || !plain) return { list, bad: raw }
    const origin = u.protocol + '//' + u.host
    if (!list.includes(origin)) list.push(origin)
  }
  return { list, tooMany: list.length > MAX_SITES }
}

/** What is wrong with the embed sites, in words, or null. */
export function originsError(o: Origins): string | null {
  if (o.bad) return copy.embedBad(o.bad)
  return o.tooMany ? copy.embedMany(MAX_SITES) : null
}

export interface Problem {
  field: 'password' | 'date' | 'sites'
  text: string
}

/** The first reason the form cannot be sent yet, or null. */
export function problem(d: Draft, now = new Date()): Problem | null {
  if (d.access === 'password' && !d.password.trim()) return { field: 'password', text: copy.needPassword }
  if (expiryDays(d, now) === null) return { field: 'date', text: copy.dateBad }
  if (d.embed) {
    const found = parseOrigins(d.sites)
    const bad = originsError(found) ?? (found.list.length ? null : copy.embedNeed)
    if (bad) return { field: 'sites', text: bad }
  }
  return null
}

/** The body of the create call. Only what the chosen options mean is sent:
 *  a password only for a password link, sites only when embedding is on. */
export function linkBody(d: Draft, fallbackName: string, now = new Date()) {
  return {
    name: d.name.trim() || fallbackName,
    password: d.access === 'password' ? d.password : '',
    revenue: d.revenue,
    notes: d.notes,
    days: expiryDays(d, now) ?? 0,
    embed_origins: d.embed ? parseOrigins(d.sites).list : [],
  }
}

/** Which parts of the viewer's page the thumbnail draws for these options. */
export function previewParts(d: Pick<Draft, 'access' | 'revenue' | 'notes' | 'expiry' | 'date'>, lockShown: boolean, now = new Date()) {
  const days = expiryDays(d, now)
  return {
    lock: d.access === 'password' && lockShown,
    revenueTile: d.revenue,
    revenueBars: d.revenue,
    notes: d.notes,
    ends: days ? endDate(days, now) : null,
  }
}

/** Where a row's end date stands: none, still ahead, or already past. */
export function endState(s: Pick<Share, 'expires_at'>, now = Date.now()): 'none' | 'ahead' | 'past' {
  if (!s.expires_at) return 'none'
  return s.expires_at * 1000 < now ? 'past' : 'ahead'
}
