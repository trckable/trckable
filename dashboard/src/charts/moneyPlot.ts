// Revenue's plots, their arithmetic: an axis of its own (0, half, top; money
// is never a second axis on the visitors plot), whether nearly every bucket
// sold (a line then, columns otherwise) and where a column stands. No React,
// so each is tested on its own (moneyPlot.test.ts).
import { threeScale } from './timeScale'

/** The revenue plot under the visitors plot: the gap between them and its own height. */
export const SPLIT_GAP = 28
export const SPLIT_PLOT = 96
export const SPLIT_H = SPLIT_GAP + SPLIT_PLOT

/** Revenue turns from columns into a line once this share of the buckets sold. */
const DENSE = 0.8
/** A line needs somewhere to bend. */
const MIN_LINE = 3

export const soldIn = (values: number[]) => values.filter((v) => v > 0).length
export const hasSales = (values: number[]) => values.some((v) => v > 0)

/** Nearly every bucket has a sale: a curve tells the truth, not a sparse set of columns. */
export function isDense(values: number[]): boolean {
  return values.length >= MIN_LINE && soldIn(values) / values.length >= DENSE
}

/** The y-axis of a revenue plot, round in the currency's own units: its
 *  labels, and the top a full column reaches. With nothing sold (this
 *  period, and the one before it) only the baseline is labelled. */
export function moneyScale(values: number[], before: number[] = []): { ticks: number[]; max: number } {
  const top = Math.max(0, ...values, ...before)
  if (!(top > 0)) return { ticks: [0], max: 1 }
  const s = threeScale(top)
  return { ticks: [0, s.step, s.max], max: s.max }
}

/** The widest a column gets, and never more than a slot's share of the plot. */
export function columnWidth(plotW: number, n: number): number {
  const cap = n <= 7 ? 26 : 18
  return Math.max(2, Math.min(cap, (plotW / Math.max(1, n)) * 0.62))
}

/** A column's height: proportional, a sale is always visible, never past the top. */
export function columnHeight(v: number, max: number, plotH: number): number {
  return Math.min(plotH, Math.max(3, (v / (max || 1)) * plotH))
}

/** A column standing on `base`, its top corners rounded. */
export function columnPath(cx: number, base: number, h: number, w: number): string {
  const l = cx - w / 2
  const t = base - h
  const r = Math.min(4, w / 2, h)
  return `M${l} ${base}V${t + r}Q${l} ${t} ${l + r} ${t}H${l + w - r}Q${l + w} ${t} ${l + w} ${t + r}V${base}Z`
}
