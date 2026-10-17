/** How a figure meets its new value: a change rolls over 400 ms and pulses once; no change does nothing; reduced motion just swaps. */
export const ROLL_MS = 400

export function rollOf(prev: number, next: number, reduced: boolean): { ms: number; pulse: boolean } {
  if (reduced || prev === next) return { ms: 0, pulse: false }
  return { ms: ROLL_MS, pulse: true }
}
