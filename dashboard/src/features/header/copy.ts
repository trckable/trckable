// The header row's words (features/header): what moves to the message files
// when translations come.
export const copy = {
  ask: 'Peek',
  askLabel: 'Peek',
  askTitle: (key: string) => `Peek (${key})`,
  filter: 'Filter',
  share: 'Share',
  shareTitle: 'Share these numbers as a picture',
  previous: 'Previous period',
  next: 'Next period',
  compareWith: { none: 'no comparison', previous: 'vs previous', year: 'vs last year', custom: 'vs custom' },
  compareLabel: 'Comparison',
  collapse: 'Collapse',
  expand: 'Expand',
  filterCount: (n: number) => `${n} filter${n === 1 ? '' : 's'}`,
  add: 'Add',
}
