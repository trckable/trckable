// The kit's own words: labels a screen reader hears and the small marks the
// cards carry. What a card says about its data comes from the feature that uses it.
import { defineCopy } from '../i18n'

export const kitWords = defineCopy('kit', {
  open: 'Open',
  corner: '↗',
  spark: '✦',
  up: '▲',
  down: '▼',
  flat: '–',
  period: 'Period',
  scoreOf: (n: number) => `${n} out of 100`,
  outOf: '/100',
  pct: (n: number) => `${n}%`,
  grab: 'Drag down to close',
  chart: 'Chart',
  columnOf: (label: string, pct: number) => `${label}: ${pct}%`,
})
