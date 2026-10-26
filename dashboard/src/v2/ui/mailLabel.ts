// The words on the Briefing's email chip: one helper so the short label and the full sentence agree on the time.
import { tag } from '../../i18n'
import { dateFmt } from '../../lib/format'
import { copy } from '../briefing/copy'

/** The send hour the daily email goes out at (local to the reader). */
export const MAIL_HOUR = 8

/** The hour as the language writes a clock time: "8:00 AM", "08:00". */
export const mailTime = (hour = MAIL_HOUR, locale: string | undefined = tag): string =>
  dateFmt(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, hour)))

/** The chip's visible text and the sentence a screen reader and the tooltip read. */
export function mailLabel(on: boolean, hour = MAIL_HOUR, locale: string | undefined = tag): { short: string; full: string } {
  const t = mailTime(hour, locale)
  return on ? { short: copy.mailDaily(t), full: copy.mailOnFull(t) } : { short: copy.mailAsk, full: copy.mailOffFull }
}
