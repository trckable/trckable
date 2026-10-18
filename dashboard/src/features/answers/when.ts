// A unix time as the day it fell on, in the language's words ("21 Sep"), and the name of a country by its code.
import { fmtDay, fromDate } from '../../lib/dates'
import { countryName } from '../../lib/format'

export const dayOf = (unix: number): string => fmtDay(fromDate(new Date(unix * 1000)))

/** "Germany" for DE; the code as it came for one the browser does not know; nothing for none. */
export const where = (code: string | undefined): string => (code ? countryName(code) : '')
