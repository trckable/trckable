// What the hero's breakdown draws: where the period's visitors came from and
// which countries, as shares, from the report the Story already has.
import type { Result, Row } from '../../lib/api'

export interface Share {
  value: string
  /** 0 to 1, of the rows' own total. */
  share: number
}

export interface Sources {
  /** Every channel, biggest first: the ring and the bar. */
  all: Share[]
  /** The ones named beside the ring. */
  top: Share[]
  countries: Share[]
}

const TOP = 4
const COUNTRIES = 3

function shares(rows: Row[] | null | undefined, whole: number): Share[] {
  return (rows ?? []).filter((r) => r.visitors > 0).map((r) => ({ value: r.value, share: Math.min(1, r.visitors / whole) }))
}

/** The breakdown, or none when no channel has a visitor. */
export function sourcesOf(cur: Result): Sources | undefined {
  const rows = (cur.dims.channel ?? []).filter((r) => r.visitors > 0)
  const total = rows.reduce((n, r) => n + r.visitors, 0)
  if (total <= 0) return undefined
  const all = shares(rows, total)
  const whole = cur.kpis.visitors > 0 ? cur.kpis.visitors : total
  return { all, top: all.slice(0, TOP), countries: shares(cur.dims.country, whole).slice(0, COUNTRIES) }
}
