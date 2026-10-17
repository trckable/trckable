// The bell's list: what happened that a person would want to hear of, put together from what the server already
// records (incidents, milestones, mentions). Pure; read marks are kept by useNotices.
import type { Milestone } from '../../lib/api'
import type { Incident } from '../../features/incidents/api'
import type { Mention } from '../../features/mentions/api'
import { sourceName } from '../briefing/model'
import { copy } from './copy'

export type NoticeKind = 'down' | 'up' | 'spike' | 'sale' | 'mention' | 'milestone' | 'weekly' | 'failed' | 'plan' | 'team'

export interface Notice {
  id: string
  kind: NoticeKind
  /** The site's domain it is about, so a tap can go there. */
  site: string
  title: string
  sub: string
  /** Unix seconds. */
  at: number
  /** Already read where it comes from (a build's own list): listed, but not counted as unread and no chime. */
  seen?: boolean
  /** A milestone told in full when it is tapped. */
  milestone?: Milestone
  /** Called when the notice is marked read (a build that keeps its own list marks it there too). */
  read?: () => void
  /** What a tap does instead of going to the page the notice is about. */
  open?: () => void
}

const mins = (s: number) => Math.max(1, Math.round(s / 60))

/** A site that stopped answering, and the moment it came back. */
export function fromIncidents(list: Incident[], domain: (id: string) => string | undefined, now: number): Notice[] {
  const out: Notice[] = []
  for (const i of list) {
    const d = domain(i.site)
    if (!d || i.kind !== 'down') continue
    out.push({ id: `down:${i.id}`, kind: 'down', site: d, title: copy.stopped(d), sub: copy.noAnswerSince(i.started_at), at: i.started_at })
    if (i.ended_at !== null && i.ended_at <= now) out.push({ id: `up:${i.id}`, kind: 'up', site: d, title: copy.backUp(d), sub: copy.wasDown(mins(i.ended_at - i.started_at)), at: i.ended_at })
  }
  return out
}

export function fromMentions(list: Mention[], domain: string): Notice[] {
  return list.map((m) => ({ id: `mention:${m.id}`, kind: 'mention' as const, site: domain, title: copy.mention(m.source === 'hn' ? sourceName(m.host) : m.host), sub: m.title, at: m.posted_at }))
}

export function fromMilestones(list: Milestone[], domain: string): Notice[] {
  return list.map((m) => ({ id: `mile:${m.kind}:${m.step}`, kind: 'milestone' as const, site: domain, title: copy.milestone(m.kind, m.value), sub: copy.milestoneSub, at: m.created_at, milestone: m }))
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
  return [...own.filter((n) => !ids.has(n.id) && !((n.kind === 'spike' || n.kind === 'milestone') && told.has(n.kind))), ...feed].sort((a, b) => b.at - a.at).slice(0, 40)
}

/** Newest first, a week back at most, and never more than 40. */
export function arrange(all: Notice[], now: number): Notice[] {
  const seen = new Set<string>()
  return all
    .filter((n) => n.at <= now + 60 && n.at >= now - 7 * 86400 && !seen.has(n.id) && !!seen.add(n.id))
    .sort((a, b) => b.at - a.at)
    .slice(0, 40)
}

export const unreadCount = (list: Notice[], read: ReadonlySet<string>): number => list.filter((n) => !n.seen && !read.has(n.id)).length
export const badge = (n: number): string => (n > 9 ? '9+' : String(n))
