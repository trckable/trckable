// The one line under the title: how the day stands across the sites, then who needs a look.
import { fmtInt } from '../../lib/format'
import { copy } from './copy'
import { totals, type TeamSite } from './model'

function pace(d: number): string {
  if (Math.abs(d) < 0.03) return copy.briefSteady
  return d > 0 ? copy.briefAbove(Math.round(d * 100)) : copy.briefBelow(Math.round(-d * 100))
}

function listOf(a: TeamSite[]): string {
  if (a.length === 1) return a[0].name
  if (a.length === 2) return copy.briefAnd(a[0].name, a[1].name)
  return copy.briefMore(a[0].name, a[1].name, a.length - 2)
}

export function briefing(sites: TeamSite[]): string {
  if (!sites.length) return copy.emptySub
  const t = totals(sites)
  const parts: string[] = []
  if (t.versus) parts.push(pace(t.versus.today / t.versus.usual - 1))
  else if (t.today > 0) parts.push(copy.briefToday(fmtInt(t.today)))
  const a = t.attention
  parts.push(a.length ? copy.briefFlag(listOf(a), a.length > 1) : copy.briefAllFine)
  return parts.join(' ')
}
