// The words of the chart's day tips: read by the one lazy chunk that writes them (dayTips.ts), so
// none of this is carried by the first load (copy.ts has the rest).
export const tipCopy = {
  perVisitor: 'Revenue / visitor',
  perVisitorShort: '$/visit',
  conversionShort: 'conv.',
  sales: (n: number) => (n === 1 ? '1 sale' : `${n} sales`),
  newAmount: (amount: string) => `${amount} new`,
  renewalAmount: (amount: string) => `${amount} renewal`,
}
