// What each locked preview says over its blur and shows under it, as the walkthrough has it (its LKS). English here; other
// languages come as message files. The figures in the samples are not words: they stay in LockCard.tsx.
import { defineCopy } from '../../i18n'

export type LockKind = 'rev' | 'search' | 'goals' | 'uptime' | 'alerts'

export const lockCopy = defineCopy('v2.lock', {
  sample: 'Sample',
  how: 'How it works',
  revTitle: 'Revenue',
  revLine: 'See what each source earns',
  revSub: 'Connect Stripe, Paddle or Lemon Squeezy',
  revBig: '$4,820',
  revRows: ['Product Hunt', 'Google', 'Newsletter'],
  searchTitle: 'Google search',
  searchLine: 'See the searches that bring people',
  searchSub: 'Connect Google Search Console',
  searchBig: '1,240 clicks',
  searchRows: ['simple web analytics', 'privacy friendly stats', 'plausible alternative'],
  goalsTitle: 'Goals',
  goalsLine: 'See what counts as a win',
  goalsSub: 'Pick a signup or a purchase',
  goalsBig: '3.4%',
  goalsRows: ['Signup', 'Checkout', 'Newsletter'],
  uptimeTitle: 'Uptime',
  uptimeLine: 'Know when your site stops answering',
  uptimeSub: 'We check every minute',
  uptimeBig: '99.98%',
  uptimeLast: 'Last 30 days',
  uptimeNone: 'no downtime',
  alertsTitle: 'Alerts',
  alertsLine: 'Get told when something changes',
  alertsSub: 'By email or Slack',
  alertsRows: ['Traffic below usual', 'Site stops answering', 'New sale'],
})
