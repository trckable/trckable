// The bell's list: what happened that a person would want to hear of, put together from what the server already
// records (incidents, milestones, mentions). Pure; read marks are kept by useNotices.
import { goalName } from '../../lib/goalName'
import { lineOf, tileLabel } from '../../features/milestones/words'
import type { Alert, Milestone, Site } from '../../lib/api'
import { answersCopy } from '../../features/answers/copy'
import { STALE_DAYS } from '../../features/install/journey'
import { sourceName } from '../briefing/model'
import { duration, startOfDay } from '../../features/incidents/model'
import { clock } from '../../lib/site'
import { fmtFixed, fmtInt, fmtMoney } from '../../lib/format'
import type { FeedRow } from './feed'
import { copy } from './copy'

export type NoticeKind = 'down' | 'up' | 'spike' | 'sale' | 'signup' | 'goal' | 'alert' | 'mention' | 'answer' | 'milestone' | 'weekly' | 'failed' | 'plan' | 'team' | 'setup'

export interface Notice {
  id: string
  kind: NoticeKind
  /** The site's domain it is about, so a tap can go there. */
  site: string
  title: string
  sub: string
  /** Unix seconds. */
  at: number
  /** The calendar day ("2026-10-31") of what is kept by the day (a milestone): listed under it as "All day", at the day's start. */
  day?: string
  /** From a build that keeps its own list: it can be put away (to its archive). */
  dismissable?: boolean
  /** Already read where it comes from (a build's own list): listed, but not counted as unread and no chime. */
  seen?: boolean
  /** A busy spell's numbers: a tap tells its story (who sent them, where they landed) and leads on to Explore. */
  busy?: { visitors: number; factor: number }
  /** A milestone told in full when it is tapped. */
  milestone?: Milestone
  /** Called when the notice is marked read (a build that keeps its own list marks it there too). */
  read?: () => void
  /** What a tap does instead of going to the page the notice is about. */
  open?: () => void
  /** The host that sent it (a surge's top referrer, the site a mention was posted on): its own mark is drawn. */
  source?: string
  /** The site's id, when the notice knows it (else it is found by its domain). */
  siteId?: string
  /** The site's time zone: every time the notice tells is written in it, as Live writes it (the viewer's own when the site is not known). */
  zone?: string
  /** The alert it came from, when that is not the kind's own (an alert the person can mute or change for the site). */
  alert?: AlertKind
  /** Still going: drawn red. */
  bad?: boolean
  /** What the row says of the time in place of the clock of `at` ('' for none): "18:39–18:49" for an incident that ended. */
  when?: string
  /** The visitor behind a goal or a signup (the journey's id) and the second it happened: the event card shows the visit. */
  visitor?: string
  exact?: number
  /** The goal's own key, for a goal or a signup: the filter that narrows Explore to it. */
  goal?: string
  /** A mention's post. */
  link?: string
  /** Several notices drawn as one row (busy moments of different sites at the same time), newest first. */
  members?: Notice[]
}

export type AlertKind = Alert['kind']

/** A site added days ago that has still had no visit: one gentle reminder to finish the install. */
export function fromSetup(sites: Site[], now: number): Notice[] {
  return sites.flatMap((s) => {
    const at = (s.created_at ?? 0) + STALE_DAYS * 86400
    return s.created_at && !s.last_event_at && at <= now ? [{ id: `setup:${s.id}`, kind: 'setup' as const, site: s.domain, title: copy.setupTitle(s.domain), sub: copy.setupSub, at }] : []
  })
}

/** The start of a calendar day in the site's zone (this browser's when there is none), as unix seconds: where a row kept by the day sits in the list. */
const startOf = (day: string, zone?: string): number => (zone ? startOfDay(day, zone) : Math.floor(new Date(`${day}T00:00:00`).getTime() / 1000))

/**
 * The server's list as notices, in its order. A row keeps its id when the thing it tells goes on (a site that was down is
 * the same row once it is back, told "was down 10m" where it sat), and a row of a site the person has no longer is left out.
 */
export function fromFeed(rows: FeedRow[], sites: Site[], now: number): Notice[] {
  const out: Notice[] = []
  for (const r of rows) {
    const s = sites.find((x) => x.id === r.site)
    const d = s?.domain ?? r.domain ?? ''
    if (r.site && (sites.length > 0 ? !s : !d)) continue
    const zone = s?.timezone || undefined
    const base = { id: r.id, site: d, siteId: r.site || undefined, at: r.at, zone }
    const hm = (t: number) => clock(new Date(t * 1000), zone ?? '')
    switch (r.kind) {
      case 'down': {
        const over = r.ended != null && r.ended <= now
        if (over) out.push({ ...base, kind: 'up', title: copy.wasDownFor(d, duration((r.ended ?? now) - r.at)), sub: '', when: `${hm(r.at)}–${hm(r.ended ?? now)}` })
        else out.push({ ...base, kind: 'down', title: copy.downSince(d, hm(r.at)), sub: '', when: '', bad: true })
        break
      }
      case 'busy': {
        const size = r.what === 'surge' ? copy.onlineN(fmtInt(r.visitors ?? 0)) : copy.peopleN(fmtInt(r.visitors ?? 0))
        const sub = [r.visitors ? size : '', r.factor ? copy.vsUsual(fmtFixed(r.factor, 1)) : ''].filter(Boolean).join(' · ')
        out.push({ ...base, kind: 'spike', title: copy.busy(d), sub, source: r.source, busy: { visitors: r.visitors ?? 0, factor: r.factor ?? 0 } })
        break
      }
      case 'mention':
        out.push({ ...base, kind: 'mention', title: copy.mention(r.source === 'hn' ? sourceName(r.host ?? '') : (r.host ?? '')), sub: r.text ?? '', source: r.host, link: r.link })
        break
      case 'answer': {
        const c = answersCopy
        const engine = c.engine[r.engine ?? ''] ?? r.engine ?? ''
        const started = r.first ? c.first(engine) : c.change.seen(engine, r.text ?? '')
        const title = r.what === 'dropped' ? c.change.dropped(engine, r.text ?? '') : started
        if (r.what === 'paused') {
          out.push({ ...base, kind: 'answer', title: c.paused, sub: c.section[0] })
          break
        }
        out.push({ ...base, kind: 'answer', title, sub: c.section[0] })
        break
      }
      case 'milestone':
        if (r.milestone && r.day) out.push({ ...base, kind: 'milestone', title: lineOf(r.milestone, true) || tileLabel(r.milestone, true), sub: '', at: zone ? startOf(r.day, zone) : r.at, day: r.day, milestone: r.milestone })
        break
      case 'sale': {
        const n = r.count ?? 1
        out.push({ ...base, kind: 'sale', title: copy.sales(n), sub: fmtMoney(r.amount ?? 0, r.currency ?? 'USD', r.exponent ?? 2) })
        break
      }
      case 'signup':
        out.push({ ...base, kind: 'signup', title: copy.signups(r.count ?? 1), sub: '', visitor: r.visitor, exact: r.seen, goal: r.goal })
        break
      case 'goal': {
        const each = (r.goals ?? []).map((g) => copy.goalEach(fmtInt(g.count), goalName(undefined, g.name ?? g.goal)))
        const title = each.length ? copy.goals(each.join(' · ')) : copy.goalCount(goalName(undefined, r.text ?? ''), r.count ?? 1)
        out.push({ ...base, kind: 'goal', title, sub: copy.goalSub, visitor: r.visitor, exact: r.seen, goal: r.goal })
        break
      }
      case 'alert': {
        const kind = (r.what ?? '') as AlertKind
        const title = ALERT_TITLE[kind]?.(d)
        if (title) out.push({ ...base, kind: 'alert', alert: kind, title, sub: '' })
        break
      }
    }
  }
  return alone(out)
}

/** The same family of milestone on the same site and day is one row, the highest number (the others are what led to it). */
function alone(list: Notice[]): Notice[] {
  const top = new Map<string, Notice>()
  for (const n of list) {
    const m = n.milestone
    if (!m) continue
    const key = `${n.siteId ?? n.site}:${m.kind}:${n.day}`
    const best = top.get(key)
    if (!best || (best.milestone?.value ?? 0) < m.value) top.set(key, n)
  }
  return list.filter((n) => !n.milestone || top.get(`${n.siteId ?? n.site}:${n.milestone.kind}:${n.day}`) === n)
}

const ALERT_TITLE: Partial<Record<AlertKind, (d: string) => string>> = { threshold: copy.alertThreshold, disk: copy.alertDisk }

/** The most rows the bell lists; a site that is down is listed past it. */
export const CAP = 40
/** The most goal rows: they have a cap of their own, so a sale, a busy spell or a site that is down is never pushed out by them. */
export const GOAL_CAP = 8
const capped = (list: Notice[]): Notice[] => {
  let goals = 0
  return list.filter((n) => n.kind !== 'goal' || goals++ < GOAL_CAP).filter((n, i) => i < CAP || n.kind === 'down')
}

/**
 * A build's own feed (its slot) tells surges and milestones with their numbers: where it has any of a kind, the site's own
 * of that kind are left out, so one event is not two rows.
 */
export function withFeed(own: Notice[], feed: Notice[] | undefined): Notice[] {
  if (!feed?.length) return own
  const told = new Set(feed.map((f) => f.kind))
  const ids = new Set(feed.map((f) => f.id))
  return capped([...own.filter((n) => !ids.has(n.id) && !((n.kind === 'spike' || n.kind === 'milestone') && told.has(n.kind))), ...feed].sort(byNewest))
}

/** The list's one order: newest first, and the id for notices of the same second, so the same rows never swap places between reads. */
export const byNewest = (a: Pick<Notice, 'at' | 'id'>, b: Pick<Notice, 'at' | 'id'>): number => b.at - a.at || Number(a.id > b.id) - Number(a.id < b.id)

/** Newest first (the server cut the week), each once, and never more than 40 besides the sites that are down. */
export function arrange(all: Notice[], now: number): Notice[] {
  const seen = new Set<string>()
  return capped(all.filter((n) => n.at <= now + 60 && !seen.has(n.id) && !!seen.add(n.id)).sort(byNewest))
}

export type NoticeRow = Notice & { unread: boolean }

/** Whether a notice counts as unread: the one rule for the dot on its row and for the bell's badge. A row of several is unread while any of them is. */
export const isUnread = (n: Notice, read: ReadonlySet<string>): boolean => (n.members ? n.members.some((m) => isUnread(m, read)) : !n.seen && !read.has(n.id))

/** Busy moments of different sites within this long of each other are one row. */
export const TOGETHER_S = 15 * 60

/**
 * Busy moments of two or more sites at the same time are one row ("2 sites are busy"); a site is in a row once, with its
 * newest. The rest of the list is as it was, in the same order.
 */
export function mergeBusy(list: Notice[]): Notice[] {
  const out: Notice[] = []
  let group: Notice[] = []
  const close = () => {
    if (group.length > 1) out.push({ id: `busy:${group[0].id}`, kind: 'spike', site: '', title: copy.busySites(group.length), sub: '', at: group[0].at, members: group })
    else out.push(...group)
    group = []
  }
  const busy = list.filter((n) => n.kind === 'spike' && !n.members && n.site).sort(byNewest)
  const taken = new Set<string>()
  for (const n of busy) {
    if (taken.has(n.id)) continue
    group = [n]
    taken.add(n.id)
    for (const m of busy) {
      if (taken.has(m.id) || n.at - m.at > TOGETHER_S || group.some((g) => g.site === m.site)) continue
      group.push(m)
      taken.add(m.id)
    }
    close()
  }
  return [...list.filter((n) => !taken.has(n.id)), ...out].sort(byNewest)
}

/** The rows the menu lists, newest first, each with its own unread mark (`sub` is left to the caller, which words the time). */
export const rowsOf = (list: Notice[], read: ReadonlySet<string>): NoticeRow[] => mergeBusy(list).map((n) => ({ ...n, unread: isUnread(n, read) }))

/** The badge number: how many of the rows the menu shows are unread, never a count of anything else. */
export const unreadCount = (rows: readonly { unread: boolean }[]): number => rows.filter((r) => r.unread).length
export const badge = (n: number): string => (n > 9 ? '9+' : String(n))

/**
 * The rows an open menu shows when the list behind it changes: nothing the person can see is taken away or moved. A row
 * that left the list (read in a build's own list, which keeps only unread ones) stays, read, until the menu shuts; only a
 * row put away (`gone`) goes. A new row takes its place in the one order, so the newest lands on top.
 */
export function settle(shown: readonly NoticeRow[], next: readonly NoticeRow[], gone: ReadonlySet<string>): NoticeRow[] {
  const live = new Set(next.map((r) => r.id))
  const kept = shown.filter((r) => !live.has(r.id) && !gone.has(r.id)).map((r) => (r.unread ? { ...r, unread: false } : r))
  return [...next.filter((r) => !gone.has(r.id)), ...kept].sort(byNewest)
}
