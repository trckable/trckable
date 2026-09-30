// "On pace for ~9,400 this month": this calendar month's whole days so far,
// spread over the days of the month. Today is not counted (it is part of a
// day), and under three whole days there is nothing to spread, so nothing is
// said. Pure: pace.test.ts.

export interface Pace {
  /** The month's total at this pace, to two significant figures. */
  total: number
  /** Days in the month. */
  days: number
  /** Whole days counted. */
  gone: number
}

export const MIN_DAYS = 3

/** Two significant figures: 9,437 is ~9,400, 94 is ~94. */
export function roundSig(n: number, sig = 2): number {
  if (n <= 0) return 0
  const pow = 10 ** Math.max(0, Math.floor(Math.log10(n)) + 1 - sig)
  return Math.round(n / pow) * pow
}

/** The first of the month that `today` ("2026-09-19") is in, and the day before today, for the report that counts the whole days. */
export function monthSoFar(today: string): { from: string; to: string } | null {
  const [y, m, d] = today.split('-').map(Number)
  if (d - 1 < MIN_DAYS) return null
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
  return { from: `${today.slice(0, 7)}-01`, to: yesterday }
}

/** `sum` is what the whole days so far added up to. */
export function paceOf(sum: number, today: string): Pace | null {
  const span = monthSoFar(today)
  if (!span || sum <= 0) return null
  const [y, m, d] = today.split('-').map(Number)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { total: roundSig((sum / (d - 1)) * days), days, gone: d - 1 }
}
