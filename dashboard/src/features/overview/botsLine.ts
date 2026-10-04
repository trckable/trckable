// The line the Visitors tile's tooltip adds: how many bots and AI crawlers were
// filtered out of the period, so the number beside it can be trusted. Nothing
// when none were (or the report did not say: under a filter it does not).
import type { Bots } from '../../lib/api'
import { fmtInt } from '../../lib/format'
import { copy } from './copy'

export function botsLine(b?: Bots): string | undefined {
  if (!b || b.total <= 0) return undefined
  return b.total === 1 ? copy.botFiltered : copy.botsFiltered(fmtInt(b.total))
}
