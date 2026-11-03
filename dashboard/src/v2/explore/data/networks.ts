// The Networks table: each internet provider with its visits, how many of them converted and how fast pages loaded for
// them. Nothing is claimed about a provider with too few visits to judge. Pure: networks.test.ts.
import type { Report, Row as ApiRow, WebVitals } from '../../../lib/api'
import { MIN_VITALS } from '../../../lib/api'
import { fmtFixed } from '../../../lib/format'
import { copy } from '../networksCopy'
import type { NetworkBasis, NetworkRow, Networks } from '../types'
import { SLOW_MS } from './quality'

export { SLOW_MS }

/** Visits a provider needs before its conversion is shown or compared. */
export const ENOUGH = 30

/** A provider as a person says it: the company's legal ending dropped ("Deutsche Telekom AG" is "Deutsche Telekom"). */
const ENDING = /[\s,]+(?:ag|gmbh\s*&\s*co\.?(?:\s*(?:kg|ohg))?|gmbh|ohg|kg|inc\.?|llc|ltd\.?|limited|corp\.?|corporation|co\.?|s\.?a\.?|s\.?p\.?a\.?|b\.?v\.?|n\.?v\.?|plc|ab|as|oy|a\/s)\.?$/i
export function networkName(raw: string): string {
  let s = raw.trim()
  for (let i = 0; i < 3; i++) {
    const t = s.replace(ENDING, '')
    if (t === s || !t) break
    s = t
  }
  return s
}

/** What the conversion column counts: sales where payments are connected, else the signup goal, else the visits that stayed. */
export function basisOf(r: Report, rows: ApiRow[]): NetworkBasis {
  if (r.current.money && rows.some((x) => x.revenue !== undefined)) return 'sales'
  return r.current.signup ? 'goal' : 'engaged'
}

const share = (row: ApiRow, basis: NetworkBasis): number => {
  if (basis === 'sales') return (row.customers ?? 0) / row.visitors
  if (basis === 'goal') return (row.signups ?? 0) / row.visitors
  return 1 - (row.bounce_rate ?? 1)
}

export function mapNetworks(r: Report, speed: WebVitals | null): Networks {
  const found = r.current.dims.network ?? []
  const basis = basisOf(r, found)
  const lcp = new Map((speed?.networks ?? []).filter((x) => x.n >= MIN_VITALS && x.lcp_ms != null).map((x) => [x.value, x.lcp_ms as number]))
  const rows: NetworkRow[] = found
    .filter((x) => x.visitors > 0)
    .map((x) => ({ value: x.value, name: networkName(x.value), people: x.visitors, rate: x.visitors >= ENOUGH ? share(x, basis) : null, lcp: lcp.get(x.value) ?? null }))
  return { say: headline(rows, basis), basis, goal: r.current.signup?.goal ?? null, rows }
}

/** A rate as the table and the headline both write it: one decimal under 10%, whole above. */
export const pctText = (x: number): string => `${fmtFixed(x * 100, x >= 0.095 ? 0 : 1)}%`

/** One line: the provider whose visitors convert least against the one whose visitors convert most, when both have enough visits and differ. */
export function headline(rows: NetworkRow[], basis: NetworkBasis = 'sales'): string {
  const judged = rows.filter((r): r is NetworkRow & { rate: number } => r.rate !== null)
  if (judged.length < 2) return copy.none
  const low = judged.reduce((a, b) => (b.rate < a.rate ? b : a))
  const high = judged.reduce((a, b) => (b.rate > a.rate ? b : a))
  if (high.rate <= low.rate) return copy.none
  return (basis === 'engaged' ? copy.sayStay : copy.say)(low.name, pctText(low.rate), high.name, pctText(high.rate))
}
