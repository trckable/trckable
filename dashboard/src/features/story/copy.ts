// The words of the moments a period holds (the pops on the chart and the story's captions).
import { fmtInt } from '../../lib/format'
import { defineCopy } from '../../i18n'

export const copy = defineCopy('story', {
  spike: (factor: string) => `Traffic ${factor}`,
  newTraffic: (visitors: number) => `New traffic · ${visitors === 1 ? '1 visitor' : `${fmtInt(visitors)} visitors`}`,
  from: (who: string) => `from ${who}`,
  sale: (n: number) => (n === 1 ? 'Sale' : `${n} sales`),
  country: (name: string) => `First visitor from ${name}`,
  ai: (bot: string) => `First AI assistant visit · ${bot}`,
  milestone: (what: string) => `Milestone · ${what}`,
  note: 'Note',
})
