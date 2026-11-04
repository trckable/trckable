// What the event card draws from a notice and from the visit behind it. Pure: eventModel.test.ts.
import type { Story, VisitStory } from '../../features/journey/model'
import type { Notice, NoticeKind } from './notices'

/** The kinds that open the card (busy rows and milestones keep their own stories). */
const CARDS: readonly NoticeKind[] = ['goal', 'signup', 'sale', 'down', 'up', 'mention']

export const hasCard = (n: Notice): boolean => !n.open && !n.members && !n.busy && !n.milestone && CARDS.includes(n.kind)

/** A visit's clock is a little loose (a goal is counted as the visit ends): a second either side. */
const SLACK_MS = 1000

/** The visit the event happened in: the one that was on at that second, else the newest that began before it. */
export function visitAt(story: Story, at: number): VisitStory | undefined {
  const ms = at * 1000
  return story.visits.find((v) => v.start - SLACK_MS <= ms && ms <= v.end + SLACK_MS) ?? story.visits.find((v) => v.start <= ms)
}

export interface Trail {
  /** The page it happened on (the last one seen before it). */
  page: string
  /** The pages before it, oldest first, the last few. */
  before: string[]
  /** How many pages the visit had shown by then. */
  seen: number
}

/** How many pages of the way in are told. */
export const TRAIL = 4

/** The pages of the visit up to the event: where it happened and the way there. */
export function trailTo(v: VisitStory, at: number): Trail {
  const ms = at * 1000
  const seen = v.nodes.filter((n) => n.kind === 'page' && n.at <= ms + SLACK_MS).map((n) => (n.kind === 'page' ? n.path : ''))
  const page = seen[seen.length - 1] ?? v.nodes.find((n) => n.kind === 'page')?.path ?? ''
  return { page, before: seen.slice(-TRAIL - 1, -1), seen: seen.length }
}

/** A span in seconds as people say it: "12m", "3h 5m", "1d 23h". */
export function fmtSpan(s: number): string {
  const m = Math.floor(s / 60)
  if (m < 1) return '<1m'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`
}
