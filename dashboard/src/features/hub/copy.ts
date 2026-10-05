// The Features pop-up's own words: its heading, the search, the groups and
// what a card says about itself. The features' names are in words.ts.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('features', {
  title: 'Features',
  search: 'Search features',
  close: 'Close',
  none: 'Nothing matches',
  groups: { traffic: 'Traffic', insights: 'Insights', revenue: 'Revenue', share: 'Share & clients', team: 'Team & security', setup: 'Setup' },
  on: 'On',
  off: 'Off',
  tryIt: 'Try it',
  builtIn: 'Built in',
  server: 'Server',
  open: 'Open',
  turnedOn: (name: string) => `${name} is on`,
  turnedOff: (name: string) => `${name} is off`,
  offTitle: (name: string) => `Turn off ${name}?`,
  offBody: 'Its views go away. What it already recorded stays.',
  offConfirm: 'Turn off',
  keep: 'Keep it on',
})
