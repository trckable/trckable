// The chart models' words (try-out). The folded layer's name is on its own: the first load reads it.
export const otherLabel = 'Other'

export const modelCopy = {
  soFar: 'so far',
  vs: (prev: string) => `vs ${prev}`,
  ahead: 'Ahead',
  behind: 'Behind',
  previous: 'Previous',
  total: 'Total',
  running: (metric: string) => `${metric} so far`,
  aheadBy: (n: string) => `+${n} ahead`,
  behindBy: (n: string) => `${n} behind`,
  onPace: 'On pace',
  thisBucket: 'This bucket',
  up: '▲',
  down: '▼',
}
