// What a row of an Explore table says: how many, against what it usually brings (or the period before, when asked),
// and what share of the whole. Pure: model.test.ts.
import { mult } from '../briefing/model'
import { judge, type Band } from '../briefing/usual'

export interface Row {
  value: string
  name: string
  /** People in this period. */
  v: number
  /** What the row usually brings (the same weekday, up to now), when that is known. */
  band: Band | null
  /** People in the period before, when comparing with it. */
  p?: number
}

export type Tone = 'up' | 'dn' | ''
export interface Delta {
  text: string
  tone: Tone
}

/** "+18%" against the period before, or "▲ 3.2×" / "▼ below" / "usual" against the row's own usual. */
function toneOf(x: number): Tone {
  if (x > 0.05) return 'up'
  return x < -0.05 ? 'dn' : ''
}

export function deltaOf(r: Row, comparing: boolean): Delta {
  if (comparing && r.p !== undefined) {
    const x = (r.v - r.p) / Math.max(r.p, 1)
    return { text: `${x >= 0 ? '+' : '−'}${Math.round(Math.abs(x) * 100)}%`, tone: toneOf(x) }
  }
  const st = r.band ? judge(r.v, r.band) : ''
  if (st === 'up' && r.band) return { text: `▲ ${r.band.c > 0.5 && r.v / r.band.c >= 1.3 ? mult(r.v / r.band.c) : 'above'}`, tone: 'up' }
  if (st === 'dn') return { text: '▼ below', tone: 'dn' }
  return { text: 'usual', tone: '' }
}

export const shareOf = (v: number, total: number): number => Math.round((v / Math.max(1, total)) * 100)

/** The rows with the widest bar as the scale: each bar's width in percent. */
export function barWidths(list: Row[]): number[] {
  const mx = Math.max(1, ...list.map((i) => Math.max(i.v, i.band?.c ?? 0)))
  return list.map((i) => (i.v / mx) * 100)
}
