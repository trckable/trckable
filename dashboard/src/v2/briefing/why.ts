// "Why?": the cause of a change (only what can be known: a post, an outage, never a guess about people), the numbers
// behind it, and what to do. The same three lines wherever a change is shown. Pure: why.test.ts.
import { fmtInt } from '../../lib/format'
import { copy } from './why.copy'

export interface Why {
  cause: string
  todo?: string
}

interface JumpIn {
  name: string
  host: string
  now: number
  lo: number
  hi: number
  /** A mention found today on the same place: its title, when, and how it did. */
  mention?: { host: string; title: string; at: string; points: number; comments: number }
  /** The page most of them landed on. */
  page?: string
}

const sameHost = (a: string, b: string) => a.replace(/^www\./, '') === b.replace(/^www\./, '')

/** Why a source sent more people than usual: the post that was found there, or that we can say who and not why. */
export function whyJump(o: JumpIn): Why {
  const m = o.mention
  if (m && (sameHost(m.host, o.host) || m.host === o.name)) {
    return { cause: copy.post(m.host, m.title, m.at, m.points, m.comments, o.page), todo: copy.replyEarly }
  }
  return { cause: copy.whoNotWhy(o.name, fmtInt(o.now), `${fmtInt(Math.max(0, o.lo))}–${fmtInt(o.hi)}`), todo: copy.answerThem(o.name) }
}

/** Why the site is not answering (or was not), in the check's own words. */
export function whyDown(o: { domain: string; cause?: string; since?: string; minutes: number; ongoing: boolean }): Why {
  return {
    cause: o.cause ? copy.downBecause(o.domain, o.cause) : copy.downUnknown(o.domain),
    todo: o.ongoing ? copy.checkServer : copy.lookBack,
  }
}

/** Why a number is above or below usual: the days it is told against, hour for hour. */
export function whyUsual(o: { label: string; now: number; weeks: { day: string; visitors: number }[]; weekday: string; at: string }): Why {
  if (!o.weeks.length) return { cause: copy.noWeeks(o.label) }
  const list = o.weeks.map((w) => fmtInt(w.visitors)).join(', ')
  return { cause: copy.weeksSaid(o.label, fmtInt(o.now), o.weekday, o.at, list), todo: copy.sourceBelow }
}
