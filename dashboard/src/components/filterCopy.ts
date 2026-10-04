// The Filter list's words (FilterPop.tsx), in one place.
import { defineCopy } from '../i18n'

export const filterCopy = defineCopy('filter', {
  search: 'Search filters',
  placeholder: 'Find anything',
  findIn: (dim: string) => `Find a ${dim.toLowerCase()}`,
  back: 'Back to every dimension',
  clear: (n: number) => `Clear ${n} filter${n > 1 ? 's' : ''}`,
  filtered: 'filtered',
  noMatch: (q: string) => `Nothing on this page matches “${q}”.`,
  noVisits: 'No visits in this period yet. Pick a longer period to filter what was recorded.',
  idle: 'Nothing to pick yet',
  fullMode: 'Full mode',
  noneYet: 'None yet',
  group: { acquisition: 'Acquisition', content: 'Content', location: 'Location', device: 'Device', behaviour: 'Behaviour' },
  dim: { channel: 'Channel', referrer: 'Referrer', campaign: 'Campaign', source: 'utm_source', medium: 'utm_medium', entry_page: 'Entry page', page: 'Page', exit_page: 'Exit page', group: 'Section', country: 'Country', region: 'Region', city: 'City', device: 'Device', browser: 'Browser', browser_version: 'Browser version', screen: 'Screen', os: 'OS', language: 'Language', goal: 'Goal' },
  idleWhy: { full: 'Shown in Full mode', none: 'Nothing recorded in this period' },
})
