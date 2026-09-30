// The Filter list's words (FilterPop.tsx), in one place.
export const filterCopy = {
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
  idleWhy: { full: 'Shown in Full mode', none: 'Nothing recorded in this period' },
}
