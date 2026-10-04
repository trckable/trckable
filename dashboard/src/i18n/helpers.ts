// What the message files use besides words: the language's own plural forms,
// numbers and days. They import nothing but lang.ts and intl.ts (see lang.ts).
import intl from './intl'
import { tag } from './lang'

const rules = new Intl.PluralRules(tag)
const numbers = new Intl.NumberFormat(tag ?? 'en-US')

/** `one` for the count the language reads as one, `other` for the rest (French counts 0 as one). */
export const plural = (n: number, one: string, other: string, r: Intl.PluralRules = rules) => (r.select(n) === 'one' ? one : other)

/** A whole number in the language's digits: 12,345 or 12.345. */
export const int = (n: number) => (Number.isFinite(n) ? numbers.format(Math.round(n)) : String(n))

/** "3 Besucher": the count, then the noun in the form the count needs. */
export const count = (n: number, one: string, other: string) => `${int(n)} ${plural(n, one, other)}`

/** A share (0.12) as the language writes a percentage with `digits` decimals: "12 %". */
export const pct = (x: number, digits = 0) => x.toLocaleString(tag, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits })

/** A "YYYY-MM-DD" day as the language writes it: "Sa., 4. Okt.", with the year when asked. */
export const dayLabel = (iso: string, o?: { weekday?: boolean; year?: boolean }) => {
  try {
    return intl.day(iso, o)
  } catch {
    return iso // not a day: said as it came
  }
}
