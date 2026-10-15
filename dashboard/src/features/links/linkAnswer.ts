// The "Which link worked?" card of the story: the best tagged link of the period as one answer, built
// from the links read and nothing else. Nothing is built (and no card drawn) until a tagged link has
// enough visitors or a goal behind it. Pure: linkAnswer.test.ts.
import { useMemo } from 'react'
import { fmtInt, fmtPct } from '../../lib/format'
import { isShared } from '../../lib/me'
import { useQuiet } from '../../lib/useLazyCard'
import type { Answer } from '../storyview/rules'
import type { Link, LinksAnswer } from './api'
import { copy } from './copy'
import { bestLinks, filterOf, timesUsual } from './model'
import { useLinks } from './useLinks'

/** One sentence on the runner-up: its visitors, and whether any of them signed up. */
function next(l: Pick<Link, 'value' | 'visitors' | 'goals'>, goals: boolean): string {
  if (!goals) return copy.runnerVisitors(l.value, l.visitors)
  return l.goals > 0 ? copy.runnerSome(l.value, l.visitors, l.goals) : copy.runnerNone(l.value, l.visitors)
}

/** The answer, or none while the links have nothing to say. `usual`: the share of the site's visitors who reach its top goal. */
export function linkAnswer(data: LinksAnswer | null, usual?: number): Answer | null {
  const found = data && bestLinks(data.links, data.goals)
  if (!found) return null
  const { best, runner } = found
  const signups = data.goals && best.goals > 0
  const what = signups ? copy.and(copy.visitorsN(best.visitors), copy.signupsN(best.goals)) : copy.visitorsN(best.visitors)
  const line = [copy.brought(best.value, what), runner ? next(runner, data.goals) : ''].filter(Boolean).join(' ')
  return {
    key: 'link',
    question: copy.question,
    line,
    sub: line,
    look: 'plain',
    act: { label: copy.see(best.value), filters: [filterOf(best)] },
    big: fmtInt(signups ? best.goals : best.visitors),
    chip: signups ? copy.pill(fmtPct(best.goals / best.visitors).replace(/[.,]0(?=\s?%)/, ''), timesUsual(best, usual)) : undefined, // 5%, not 5.0%
    status: signups ? copy.statusSignups : copy.statusVisitors,
    spark: best.spark,
  }
}

/** The card's answer for a period: read once the page's own reads are done, never on a shared link. */
export function useLinkAnswer(site: string, from: string, to: string, usual?: number): Answer | null {
  const quiet = useQuiet()
  const { data } = useLinks(site, from, to, quiet && !isShared(), false)
  return useMemo(() => linkAnswer(data, usual), [data, usual])
}
