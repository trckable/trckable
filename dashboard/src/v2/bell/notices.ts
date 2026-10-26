// The bell's list: what happened that a person would want to hear of, put together from what the server already
// records (incidents, milestones, mentions). Pure; read marks are kept by useNotices.
import { lineOf } from '../../features/milestones/words'
import type { Alert, Milestone, Site } from '../../lib/api'
import type { Incident } from '../../features/incidents/api'
import type { Mention } from '../../features/mentions/api'
import { answersCopy } from '../../features/answers/copy'
import type { AnswersReport } from '../../features/answers/api'
import { STALE_DAYS } from '../../features/install/journey'
import { sourceName } from '../briefing/model'
import { duration, isDown } from '../../features/incidents/model'
import { clock } from '../../lib/site'
import { fmtFixed, fmtInt } from '../../lib/format'
import type { Moment } from '../../features/story/moments'
import { copy } from './copy'

export type NoticeKind = 'down' | 'up' | 'spike' | 'sale' | 'mention' | 'answer' | 'milestone' | 'weekly' | 'failed' | 'plan' | 'team' | 'setup'

export interface Notice {
  id: string
  kind: NoticeKind
  /** The site's domain it is about, so a tap can go there. */
  site: string
  title: string
  sub: string
  /** Unix seconds. */
  at: number
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
  /** The alert it came from, when that is not the kind's own (an alert the person can mute or change for the site). */
  alert?: AlertKind
  /** Still going: drawn red. */
  bad?: boolean
  /** What the row says of the time in place of the clock of `at` ('' for none): "18:39–18:49" for an incident that ended. */
  when?: string
  /** Several notices drawn as one row (busy moments of different sites at the same time), newest first. */
  members?: Notice[]
}

export type AlertKind = Alert['kind']

/** How many of the account's other sites the bell reads on top of the one in view. */
export const OTHERS = 6

/** The sites the bell reads besides the one in view: those that have had a visit, the first few in the account's order. */
export const othersOf = (sites: Site[], current: Site | null): Site[] => sites.filter((s) => s.id !== current?.id && !!s.last_event_at).slice(0, OTHERS)

/** One row for each time a site stopped answering: red and "down since 18:39" while it goes on, "was down 10m" with its span once it is over. The server's incident id pairs the two; no row is made of a guess. */
export function fromIncidents(list: Incident[], domain: (id: string) => string | undefined, now: number): Notice[] {
  const out: Notice[] = []
  const at = (t: number) => clock(new Date(t * 1000), '')
  for (const i of list) {
    const d = domain(i.site)
    if (!d || !isDown(i)) continue
    const over = i.ended_at !== null && i.ended_at <= now
    if (over) out.push({ id: `up:${i.id}`, kind: 'up', site: d, siteId: i.site, title: copy.wasDownFor(d, duration((i.ended_at ?? now) - i.started_at)), sub: '', when: `${at(i.started_at)}–${at(i.ended_at ?? now)}`, at: i.ended_at ?? now })
    else out.push({ id: `down:${i.id}`, kind: 'down', site: d, siteId: i.site, title: copy.downSince(d, at(i.started_at)), sub: '', when: '', bad: true, at: i.started_at })
  }
  return out
}

/** A site added days ago that has still had no visit: one gentle reminder to finish the install. */
export function fromSetup(sites: Site[], now: number): Notice[] {
  return sites.flatMap((s) => {
    const at = (s.created_at ?? 0) + STALE_DAYS * 86400
    return s.created_at && !s.last_event_at && at <= now ? [{ id: `setup:${s.id}`, kind: 'setup' as const, site: s.domain, title: copy.setupTitle(s.domain), sub: copy.setupSub, at }] : []
  })
}

export function fromMentions(list: Mention[], domain: string): Notice[] {
  return list.map((m) => ({ id: `mention:${m.id}`, kind: 'mention' as const, site: domain, title: copy.mention(m.source === 'hn' ? sourceName(m.host) : m.host), sub: m.title, source: m.host, at: m.posted_at }))
}

/**
 * A busy spell the server recorded: its hour (a spike) or its moment (a surge: the most online at once), how many times the
 * usual it was, and the host that sent most of them, so the bell draws that source's own mark. One row for each moment: a
 * spike of the hour a surge falls in is the same moment, and is left out.
 */
export function fromMoments(list: Moment[], domain: string): Notice[] {
  const hour = (t: string) => t.slice(0, 13)
  const surges = new Set(list.filter((m) => m.kind === 'surge').map((m) => hour(m.t)))
  return list.flatMap((m) => {
    if ((m.kind !== 'spike' && m.kind !== 'surge') || (m.kind === 'spike' && surges.has(hour(m.t)))) return []
    const at = Math.floor(Date.parse(m.t.length > 10 ? `${m.t.slice(0, 16)}:00Z` : `${m.t}T00:00:00Z`) / 1000)
    if (!Number.isFinite(at)) return []
    const size = m.kind === 'surge' ? copy.onlineN(fmtInt(m.visitors ?? 0)) : copy.peopleN(fmtInt(m.visitors ?? 0))
    const sub = [m.visitors ? size : '', m.factor ? copy.vsUsual(fmtFixed(m.factor, 1)) : ''].filter(Boolean).join(' · ')
    return [{ id: `busy:${m.kind}:${m.t}`, kind: 'spike' as const, site: domain, title: copy.busy(domain), sub, source: m.referrer, at, busy: { visitors: m.visitors ?? 0, factor: m.factor ?? 0 } }]
  })
}

/** What the assistants did lately with the site's questions (the first time one names it is told as such), and a budget that ran out. */
export function fromAnswers(rep: Pick<AnswersReport, 'changes' | 'paused'>, domain: string, now: number, open: () => void): Notice[] {
  const c = answersCopy
  const out: Notice[] = (rep.changes ?? []).map((x) => {
    const engine = c.engine[x.engine] ?? x.engine
    const started = x.first_ever ? c.first(engine) : c.change.seen(engine, x.question)
    const title = x.kind === 'dropped' ? c.change.dropped(engine, x.question) : started
    return { id: `answer:${x.engine}:${x.question_id}:${x.at}`, kind: 'answer' as const, site: domain, title, sub: c.section[0], at: x.at, open }
  })
  if (rep.paused) out.push({ id: `answer:paused:${new Date(now * 1000).toISOString().slice(0, 7)}`, kind: 'answer', site: domain, title: c.paused, sub: c.section[0], at: now, open })
  return out
}

export function fromMilestones(list: Milestone[], domain: string): Notice[] {
  return list.map((m) => ({ id: `mile:${m.kind}:${m.step}`, kind: 'milestone' as const, site: domain, title: lineOf(m, true), sub: '', at: m.created_at, milestone: m }))
}

/**
 * A build's own feed (its slot) tells surges and milestones with their numbers: where it has any of a kind, the site's own
 * of that kind are left out, so one event is not two rows. Alert rules that fired are not rows: they carry no number or
 * detail to say, and the feed or the Briefing has the event itself.
 */
export function withFeed(own: Notice[], feed: Notice[] | undefined): Notice[] {
  if (!feed?.length) return own
  const told = new Set(feed.map((f) => f.kind))
  const ids = new Set(feed.map((f) => f.id))
  return [...own.filter((n) => !ids.has(n.id) && !((n.kind === 'spike' || n.kind === 'milestone') && told.has(n.kind))), ...feed].sort(byNewest).slice(0, 40)
}

/** The list's one order: newest first, and the id for notices of the same second, so the same rows never swap places between reads. */
export const byNewest = (a: Pick<Notice, 'at' | 'id'>, b: Pick<Notice, 'at' | 'id'>): number => b.at - a.at || a.id.localeCompare(b.id)

/** Newest first, a week back at most, and never more than 40. */
export function arrange(all: Notice[], now: number): Notice[] {
  const seen = new Set<string>()
  return all
    .filter((n) => n.at <= now + 60 && n.at >= now - 7 * 86400 && !seen.has(n.id) && !!seen.add(n.id))
    .sort(byNewest)
    .slice(0, 40)
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
