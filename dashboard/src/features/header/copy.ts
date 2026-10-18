// The header row's words (features/header): what moves to the message files
// when translations come.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('header', {
  ask: 'Peek',
  askTitle: (key: string) => `Peek (${key})`,
  filter: 'Filter',
  settingsFor: (domain: string) => `Settings for ${domain}`,
  share: 'Share',
  shareTitle: 'Share these numbers as a picture',
  previous: 'Previous period',
  next: 'Next period',
  /** The tag inside the period control while a comparison is on, after the ±. */
  cmpTag: { previous: 'vs before', year: 'vs last year', custom: 'vs custom' },
  collapse: 'Collapse',
  expand: 'Expand',
  filterCount: (n: number) => `Filter, ${n} in force`,
  filterNote: (n: number) => `· ${n} filter${n === 1 ? '' : 's'}`,
})
