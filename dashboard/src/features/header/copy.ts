// The header row's words (features/header): what moves to the message files
// when translations come.
export const copy = {
  ask: 'Peek',
  askTitle: (key: string) => `Peek (${key})`,
  filter: 'Filter',
  share: 'Share',
  shareTitle: 'Share these numbers as a picture',
  previous: 'Previous period',
  next: 'Next period',
  noComparison: 'no comparison',
  collapse: 'Collapse',
  expand: 'Expand',
  filterNote: (n: number) => `· ${n} filter${n === 1 ? '' : 's'}`,
}
