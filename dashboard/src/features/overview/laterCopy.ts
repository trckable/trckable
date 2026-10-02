// The words of Replay's speed menu and of the chart's day tips: lazy chunks, so
// none of this is carried by the first load (copy.ts has the rest).
export const laterCopy = {
  speed: 'Replay speed',
  speedNow: (name: string) => `Replay speed: ${name}`,
  playsIn: (time: string) => `plays in ${time}`,
  speedKeys: 'Slower [  Faster ]',
  perVisitor: 'Revenue / visitor',
  perVisitorShort: '$/visit',
  conversionShort: 'conv.',
  sales: (n: number) => (n === 1 ? '1 sale' : `${n} sales`),
  newAmount: (amount: string) => `${amount} new`,
  renewalAmount: (amount: string) => `${amount} renewal`,
}
