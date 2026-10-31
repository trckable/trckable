// The goal cards' and the header's Goals menu's words.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('v2.goals', {
  goals: 'Goals',
  funnel: 'Funnel',
  menu: 'Goals and funnels',
  first: 'Track your first goal',
  track: 'Track a goal',
  seeAll: 'See all',
  suggested: 'Suggested',
  add: 'Add',
  addTip: (n: string) => `Count ${n}`,
  card: (name: string, value: string, change: string) => (change ? `${name}, ${value}, ${change}` : `${name}, ${value}`),
  change: (up: boolean, pct: number) => `${up ? 'up' : 'down'} ${pct} percent`,
})
