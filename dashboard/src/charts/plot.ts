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

export const zeros = (n: number) => Array<number>(n).fill(0)
export const pad = (a: number[], n: number) => (a.length >= n ? a.slice(0, n) : [...a, ...zeros(n - a.length)])
