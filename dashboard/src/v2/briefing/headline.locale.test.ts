// The headline is the most-read line on the page: every clause of it comes from the message files, so no language
// reads English words in the middle of its own sentence.
import { describe, expect, it } from 'vitest'
import de from '../../i18n/locales/de'
import es from '../../i18n/locales/es'
import fr from '../../i18n/locales/fr'
import it_ from '../../i18n/locales/it'
import nl from '../../i18n/locales/nl'

const files = { de, es, fr, it: it_, nl } as unknown as Record<string, Record<string, (...a: unknown[]) => string>>
const English = /\b(came|above|below|brought|sent|usual|people|person|only|and|expect|right|about|as)\b/i
const clauses: Record<string, unknown[]> = {
  peopleN: [12],
  came: ['12 X', 12],
  cameDot: ['12 X', 12],
  cameAbove: ['12 X', 12, 'WORDS', ' TH'],
  aboveUsualDot: [' TH'],
  brought: ['NAME', '12 X', '2×', 'VS'],
  sentTimes: ['NAME', '2×', 'VS'],
  broughtPpl: ['NAME', '12 X'],
  sentPpl: ['NAME', '12 X'],
  cameTimes: ['12 X', 12, '2×', 'WORDS'],
  timesUsualDot: ['2×'],
  onlyBelow: ['12 X', 12, 'WORDS'],
  onlyCame: ['12 X', 12],
  cameExpected: ['12 X', 12],
  cameAsUsual: ['12 X', 12],
}
const plain = ['belowUsualDot', 'andJoin', 'yourUsual']

describe.each(Object.keys(files))('the headline in %s', (l) => {
  it('has every clause, and none reads English', () => {
    const m = files[l]
    for (const [k, args] of Object.entries(clauses)) {
      expect(typeof m[`briefing.${k}`], k).toBe('function')
      const out = m[`briefing.${k}`](...args)
      expect(out.replace(/NAME|WORDS|VS|TH|X/g, ''), `${l} ${k}: ${out}`).not.toMatch(English)
    }
    for (const k of plain) expect(String(m[`briefing.${k}`]), k).not.toMatch(English)
  })
})
