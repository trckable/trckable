// How the score is worked out, said with the day's own numbers: what each part is made of, against what it is told,
// and what it came to. Built from the same scores the ring shows, so the sheet and the ring cannot differ. Pure: scoreWhy.test.ts.
import { fmtInt } from '../../lib/format'
import { copy } from './copy'
import { overall, type Score } from './model'

/** The figures behind the parts, as the page worked them out. */
export interface ScoreFacts {
  traffic: { now: number; lo: number; hi: number; /** Counted hour by hour (a visitor in three hours counts three times, on both sides). */ hourly: boolean; weekday: string; /** "16:06" while the day is running, else none. */ at: string | null } | null
  engagement: { leave: number; usual: number | null } | null
  uptime: { pct: string; downMin: number } | null
}

export interface WhyRow {
  key: Score['key']
  name: string
  value: number
  /** The figures: "590 people by 16:06; a usual Saturday has 410–520 by then". */
  figures: string
  /** The rule that turns them into the number. */
  rule: string
}

const names = { traffic: () => copy.traffic, engagement: () => copy.engagement, uptime: () => copy.uptime }

function figuresOf(s: Score, f: ScoreFacts): { figures: string; rule: string } | null {
  if (s.key === 'traffic' && f.traffic) {
    const t = f.traffic
    const range = `${fmtInt(Math.round(t.lo))}–${fmtInt(Math.round(t.hi))}`
    const base = t.at ? copy.whyTraffic(fmtInt(t.now), t.at, t.weekday, range) : copy.whyTrafficPeriod(fmtInt(t.now), range)
    return { figures: t.hourly ? `${base} ${copy.whyHourly}` : base, rule: copy.whyTrafficRule }
  }
  if (s.key === 'engagement' && f.engagement) {
    const e = f.engagement
    return { figures: e.usual === null ? copy.whyLeave(String(Math.round(e.leave * 100))) : copy.whyLeaveUsual(String(Math.round(e.leave * 100)), String(Math.round(e.usual * 100))), rule: copy.whyEngagementRule }
  }
  if (s.key === 'uptime' && f.uptime) return { figures: copy.whyUptime(f.uptime.pct, f.uptime.downMin), rule: copy.whyUptimeRule }
  return null
}

/** One row for every part that has a number; a part that cannot be told has no row (and weighs nothing in the score). */
export function whyRows(scores: Score[], f: ScoreFacts): WhyRow[] {
  const rows: WhyRow[] = []
  for (const s of scores) {
    const x = s.value === null ? null : figuresOf(s, f)
    if (x && s.value !== null) rows.push({ key: s.key, name: names[s.key](), value: s.value, ...x })
  }
  return rows
}

/** The total, from the rows alone: the same sum the ring does. */
export const totalOf = (rows: WhyRow[]): number | null => overall(rows.map((r) => ({ key: r.key, value: r.value, verdict: 'usual', words: '' })))
