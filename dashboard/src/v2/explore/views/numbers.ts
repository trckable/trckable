// How Explore writes a number: thousands as 12k, a share to one decimal.
import { fmtFixed, fmtInt } from '../../../lib/format'

/** 1,234 → "1.2k", 12,345 → "12k", under a thousand as it is. */
export const fmtK = (n: number): string => (n >= 1000 ? `${fmtFixed(n / 1000, n >= 10000 ? 0 : 1)}k` : fmtInt(n))

/** 0.0123 → "1.2%". */
export const pct1 = (x: number): string => `${fmtFixed(x * 100, 1)}%`
