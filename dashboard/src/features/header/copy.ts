// The header row's words (features/header): what moves to the message files
// when translations come.
export const copy = {
  ask: 'Peek',
  askTitle: (key: string) => `Peek (${key})`,
  filter: 'Filter',
  settingsFor: (domain: string) => `Settings for ${domain}`,
  share: 'Share',
  shareTitle: 'Share these numbers as a picture',
  previous: 'Previous period',
  next: 'Next period',
  noComparison: 'no comparison',
  compare: 'Compare',
  compareTitle: (key: string) => `Compare (${key})`,
  compareMenu: 'Compare with',
  collapse: 'Collapse',
  expand: 'Expand',
  filterNote: (n: number) => `· ${n} filter${n === 1 ? '' : 's'}`,
}
