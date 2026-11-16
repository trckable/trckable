// The periods a shared link offers, and the only ones its server answers: the server keeps the same list
// (server/internal/api/shareperiod.go) and its test reads this file, so the two cannot drift apart.
import fixture from './sharePeriods.json'

export const SHARE_PERIODS: string[] = fixture.periods.map((p) => p.id)
export const SHARE_DEFAULT: string = fixture.default

/** The period an address names on a shared link: one of the offered ones, or the default. */
export const sharePeriodOf = (id: string | null | undefined): string => (id && SHARE_PERIODS.includes(id) ? id : SHARE_DEFAULT)
