// Time in the words of the chosen language (Intl, so no word list to translate).
import { tag } from '../../i18n'
import { dateFmt } from '../../lib/format'

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
]

/** "12 minutes ago", "2 days ago"; "now" inside a minute. */
export function agoWords(unix: number, now = Date.now()): string {
  const s = Math.max(0, Math.round(now / 1000 - unix))
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' })
  for (const [unit, n] of UNITS) if (s >= n) return rtf.format(-Math.round(s / n), unit)
  return rtf.format(0, 'second')
}

/** "15 Oct, 14:32". */
export const whenWords = (unix: number): string => dateFmt(tag, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(unix * 1000)

/** "3 Oct". */
export const dayWords = (unix: number): string => dateFmt(tag, { day: 'numeric', month: 'short' }).format(unix * 1000)
