// A sparkline's line: each day's visitors as a point, the biggest day at the
// top, a quiet row a flat line along the bottom. Pure, so it can be tested.
export const SPARK_W = 56
export const SPARK_H = 18
const PAD = 1.5

/** The points of the polyline, "x,y x,y …" in a SPARK_W × SPARK_H box; empty when there is nothing to draw. */
export function sparkPoints(values: readonly number[]): string {
  if (values.length < 2) return ''
  const max = Math.max(...values, 1)
  const w = SPARK_W - 2 * PAD
  const h = SPARK_H - 2 * PAD
  return values.map((v, i) => `${(PAD + (i / (values.length - 1)) * w).toFixed(1)},${(PAD + h - (v / max) * h).toFixed(1)}`).join(' ')
}
