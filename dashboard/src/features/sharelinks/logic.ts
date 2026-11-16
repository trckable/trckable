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
  live: boolean
  expiry: Expiry
  /** yyyy-mm-dd, from the date field */
  date: string
  embed: boolean
  sites: string
  /** The sections of Explore the link shows, besides the headline numbers. */
  sections: string[]
  /** The period the link is fixed to; '' lets whoever opens it choose. */
  period: string
  /** Editing a link that already has a password: leaving the field empty keeps it. */
  hadPassword?: boolean
}

/** What a link can leave out: the sections of Explore (the server's own list), and the periods it can be fixed to. */
export const SECTIONS = ['pages', 'sources', 'places', 'tech'] as const
export const PERIODS = ['7d', '30d', '12mo'] as const

export const EMPTY: Draft = { name: '', access: 'public', password: '', revenue: false, notes: false, live: false, expiry: 'never', date: '', embed: false, sites: '', sections: [...SECTIONS], period: '' }

/** The sections in the server's order, so two lists of the same sections compare equal. */
const ordered = (list: readonly string[]) => SECTIONS.filter((s) => list.includes(s))

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The form of a link that exists, to change it. */
export function draftOf(s: Share): Draft {
  const origins = s.embed_origins ?? []
  return {
    name: s.name,
    access: s.has_password ? 'password' : 'public',
    password: '',
    hadPassword: s.has_password,
    revenue: s.revenue,
    notes: !!s.notes,
    live: !!s.live,
    expiry: s.expires_at ? 'date' : 'never',
    date: s.expires_at ? iso(new Date(s.expires_at * 1000)) : '',
    embed: origins.length > 0,
    sites: origins.join(' '),
    sections: ordered(s.sections ?? SECTIONS),
    period: s.period ?? '',
  }
}

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
export function problem(d: Draft, now = new Date(), was?: Draft): Problem | null {
  if (d.access === 'password' && !d.password.trim() && !d.hadPassword) return { field: 'password', text: copy.needPassword }
  // An end date left as it was is not checked again: a link that has ended can still be renamed.
  const sameEnd = was && d.expiry === was.expiry && d.date === was.date
  if (!sameEnd && expiryDays(d, now) === null) return { field: 'date', text: copy.dateBad }
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
    live: d.live,
    days: expiryDays(d, now) ?? 0,
    embed_origins: d.embed ? parseOrigins(d.sites).list : [],
    sections: ordered(d.sections),
    period: d.period,
  }
}

/** What to send to change a link from `was` to `d`: only what differs, so a
 *  rename never touches the password or the end date. Revenue is fixed when a
 *  link is made, so it is never in it. */
export function patchBody(was: Draft, d: Draft, now = new Date()) {
  const body: { name?: string; notes?: boolean; live?: boolean; days?: number; password?: string; embed_origins?: string[]; sections?: string[]; period?: string } = {}
  if (d.name.trim() !== was.name.trim()) body.name = d.name.trim()
  if (d.notes !== was.notes) body.notes = d.notes
  if (d.live !== was.live) body.live = d.live
  if (ordered(d.sections).join() !== ordered(was.sections).join()) body.sections = ordered(d.sections)
  if (d.period !== was.period) body.period = d.period
  if (d.expiry !== was.expiry || d.date !== was.date) body.days = expiryDays(d, now) ?? 0
  if (d.access === 'public' && was.hadPassword) body.password = ''
  if (d.access === 'password' && d.password.trim()) body.password = d.password
  const list = d.embed ? parseOrigins(d.sites).list : []
  if (list.join('\n') !== (was.embed ? parseOrigins(was.sites).list : []).join('\n')) body.embed_origins = list
  return body
}

/** What the preview of the page is made from: what a link shows (not who may open it, nor until when). */
export function previewOptions(d: Draft, fallbackName: string) {
  return { name: d.name.trim() || fallbackName, revenue: d.revenue, notes: d.notes, live: d.live, sections: ordered(d.sections), period: d.period }
}

/** Where a row's end date stands: none, still ahead, or already past. */
export function endState(s: Pick<Share, 'expires_at'>, now = Date.now()): 'none' | 'ahead' | 'past' {
  if (!s.expires_at) return 'none'
  return s.expires_at * 1000 < now ? 'past' : 'ahead'
}
