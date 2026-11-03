// The Speed section's cost card: what slow pages lose in a month, against the fast ones.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('v2slow', {
  lostMoney: (amount: string) => `About ${amount} a month lost on slow pages.`,
  lostMoneyMost: (amount: string) => `About ${amount} a month lost on slow pages, most of it on pages slower than 4 s.`,
  lostGoals: (n: string) => `About ${n} conversions a month lost on slow pages.`,
  lostGoalsMost: (n: string) => `About ${n} conversions a month lost on slow pages, most of it on pages slower than 4 s.`,
  lostEngaged: (n: string) => `About ${n} engaged visits a month lost on slow pages.`,
  lostEngagedMost: (n: string) => `About ${n} engaged visits a month lost on slow pages, most of it on pages slower than 4 s.`,
  method: 'Compared with your fast pages. An estimate, not a sum.',
  few: 'Not enough visits to compare yet.',
  bandSlow: 'Slow',
  bandMid: 'Needs work',
  bandFast: 'Fast',
  rangeSlow: 'over 4 s',
  rangeMid: '2.5 to 4 s',
  rangeFast: 'under 2.5 s',
  loadTime: 'Load time',
  visits: 'Visits',
  rateMoney: 'Paid',
  rateGoals: 'Converted',
  rateEngaged: 'Engaged',
  lost: 'Lost',
})
