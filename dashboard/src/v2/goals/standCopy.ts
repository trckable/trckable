// What the goals list, a goal's page and the bell's goals card say of a goal that stands out. English here; other languages come as message files.
import { defineCopy } from '../../i18n'

export const stand = defineCopy('goalstand', {
  // The bell's card.
  reached: (n: number, shown: string, when: string) => `${shown} ${n === 1 ? 'goal' : 'goals'} reached ${when}`,
  onDay: (day: string) => `on ${day}`,
  today: 'today',
  yesterday: 'yesterday',
  outOf: (out: number, total: number) => {
    if (out === 0) return 'Nothing stands out. A normal day.'
    if (out === total) return out === 1 ? 'It stands out.' : `All ${out} stand out.`
    return `${out} ${out === 1 ? 'stands' : 'stand'} out. The rest is a normal day.`
  },
  standsOut: 'Stands out',
  asUsual: 'As usual',
  last: (time: string) => `last ${time}`,
  openToday: 'Open all goals for today',
  back: 'Back',
  close: 'Close',
  label: 'Goals reached',
  // Why a goal stands out.
  first: 'First time ever',
  times: (n: string) => `${n}× a usual day`,
  // The goals list.
  listReached: 'Goals reached',
  listOut: 'Stand out',
  listNone: 'None',
  listBest: 'Best source for goals',
  listShare: (n: string) => `${n} of goals reached`,
  colGoal: 'Goal',
  colReached: 'Reached',
  colUsual: 'vs usual',
  colTrend: 'Over the period',
  vsFirst: 'New',
  vsAsUsual: 'as usual',
  empty: 'No goal was reached in this period.',
  emptyHint: 'A goal you track shows up here each time it is reached.',
  failed: 'The goals could not be read.',
  rowOpen: (name: string) => `Open ${name}`,
  // A goal's page.
  allGoals: 'All goals',
  tileToday: 'Today',
  tileReached: 'Reached',
  tileUsual: 'Usual day',
  tileFrom: 'Mostly from',
  usualAsUsual: 'As usual.',
  whyFirst: 'First time ever: this goal had not been reached before.',
  whyTimes: (n: string, usual: string) => `${n}× a usual day (a usual day is ${usual}).`,
  each: 'Each time it happened',
  cameFrom: 'Came from',
  onPage: 'On page',
  noTimes: 'Nothing to list.',
  direct: 'Direct',
  more: (n: string) => `${n} more in this period`,
  loading: 'Reading the goal',
  gone: 'This goal was not reached in this period.',
  // The notification choice.
  openGoals: 'Open in Goals',
  quietOff: 'Only tell me when it stands out',
  quietOn: 'You hear of it only when it stands out',
  quietFailed: 'Could not save that. Try again.',
})
