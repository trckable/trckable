// What each locked card says: what connecting gives and the one step. No example figures stand in it. English here; other
// languages come as message files.
import { defineCopy } from '../../i18n'

export type LockKind = 'rev' | 'search' | 'goals' | 'uptime' | 'alerts'

export const lockCopy = defineCopy('v2.lock', {
  how: 'How it works',
  revLine: 'See what each source earns',
  revSub: 'Connect Stripe, Paddle or Lemon Squeezy',
  searchLine: 'See the searches that bring people',
  searchSub: 'Connect Google Search Console',
  goalsLine: 'See what counts as a win',
  goalsSub: 'Pick a signup or a purchase',
  uptimeLine: 'Know when your site stops answering',
  uptimeSub: 'We check every minute',
  alertsLine: 'Get told when something changes',
  alertsSub: 'By email or Slack',
})
