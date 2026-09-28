// How much accent sits behind a cohort cell's number. Light text reads on the
// accent up to about 42%, dark ink from about 50%; in between neither passes
// WCAG AA on the dark theme. So the fill skips that band: a cell is at most 40%
// (light text) or at least 53% (dark ink, the .solid class), never between.
export const SOLID = 53

export function cohortFill(share: number): number {
  const raw = Math.round(Math.max(0, Math.min(1, share)) * 78)
  if (raw >= 46) return Math.max(raw, SOLID)
  return Math.min(raw, 40)
}
