// The Revenue tile's words and the card it opens, apart from the first load's:
// they are only read once its chunk is.
export const revenueCopy = {
  connectPayments: 'Connect payments to see revenue',
  card: {
    label: 'Revenue',
    title: 'See which traffic pays',
    body: 'Revenue per visitor, pages that sell, latest buyers.',
    connect: (name: string) => `Connect ${name}`,
    go: 'Connect',
    close: 'Close',
  },
  /** The providers trckable reads payments from, in the order Settings lists them. */
  providers: [
    { id: 'stripe', name: 'Stripe' },
    { id: 'lemonsqueezy', name: 'Lemon Squeezy' },
    { id: 'polar', name: 'Polar' },
    { id: 'paddle', name: 'Paddle' },
    { id: 'dodo', name: 'Dodo Payments' },
  ],
}
