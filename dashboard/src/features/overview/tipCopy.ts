// The words of the chart's day tips: read by the one lazy chunk that writes them (dayTips.ts), so
// none of this is carried by the first load (copy.ts has the rest).
import { defineCopy } from '../../i18n'

export const tipCopy = defineCopy('overview.tip', {
  perVisitor: 'Revenue / visitor',
  pageviews: 'Pageviews',
  short: { views: 'views', bounce: 'bounce', session: 'session', visitors: 'visitors' },
  perVisitorShort: '$/visit',
  conversionShort: 'conv.',
  sales: (n: number) => (n === 1 ? '1 sale' : `${n} sales`),
  newAmount: (amount: string) => `${amount} new`,
  renewalAmount: (amount: string) => `${amount} renewal`,
})
