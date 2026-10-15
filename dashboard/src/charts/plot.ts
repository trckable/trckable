// The main chart's plot box, shared by the chart and the scrubber under it,
// so the scrubber's track starts where the plot does.
export const PAD_L = 44
export const PAD_T = 8
export const AXIS_H = 26
export const CHART_H = 220
/** The lane above the plot that the moments' markers sit on. */
export const LANE_H = 36
/** How long the lines and columns take to settle on a new period or number: a blink, not a show. */
export const CHART_MS = 120

/** Where the hover card goes: beside the point, flipped to its left near the
 *  right edge, and never past either edge of the chart. */
export function tipLeft(px: number, w: number, tipW: number): number {
  const right = px + 14
  const left = px - 14 - tipW
  return Math.max(0, Math.min(w - tipW, right + tipW > w ? left : right))
}

/** Where a small tip sits: beside the mark on the side that has room, clamped
 *  inside the box, and above or below the mark when the box is too narrow to
 *  keep it beside the mark, so it never covers the mark. */
export function placeTip(x: number, y: number, tw: number, th: number, w: number, h: number): { left: number; top: number } {
  const GAP = 12
  const clampY = (v: number) => Math.max(0, Math.min(h - th, v))
  let left = x + GAP
  if (left + tw > w) left = x - GAP - tw
  if (left >= 0 && left + tw <= w) return { left, top: clampY(y - GAP) }
  // Neither side has room: centred on the mark, above it, else below it.
  const above = y - GAP - th
  return { left: Math.max(0, Math.min(w - tw, x - tw / 2)), top: above >= 0 ? above : clampY(y + GAP) }
}

export const zeros = (n: number) => Array<number>(n).fill(0)
export const pad = (a: number[], n: number) => (a.length >= n ? a.slice(0, n) : [...a, ...zeros(n - a.length)])
