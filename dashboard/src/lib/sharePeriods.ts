// The periods a shared link offers, and the only ones its server answers: the server keeps the same list
// (server/internal/api/shareperiod.go) and its test reads this file, so the two cannot drift apart.
import fixture from './sharePeriods.json'

export const SHARE_PERIODS: string[] = fixture.periods.map((p) => p.id)
export const SHARE_DEFAULT: string = fixture.default

/** The period an address names on a shared link: one of the offered ones, or the default. */
export const sharePeriodOf = (id: string | null | undefined): string => (id && SHARE_PERIODS.includes(id) ? id : SHARE_DEFAULT)

/** The days a link fixed to a stretch shows: `from..to` (cut back to today), or `since:from` up to today. null for a preset, which is a name and not days. */
export function fixedDays(period: string, today: string): { from: string; to: string } | null {
  const day = /^\d{4}-\d{2}-\d{2}$/
  const [a, b] = period.startsWith('since:') ? [period.slice(6), today] : period.split('..')
  if (!a || !b || !day.test(a) || !day.test(b)) return null
  const to = b < today ? b : today
  return { from: a < to ? a : to, to }
}
