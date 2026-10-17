// What the Verified seal says, in its few places: the seal on the site's avatar, its panel, the badges on
// cards and the switcher's seal. A badge is one independent source, one per kind (model.ts). The sources
// themselves come from the server.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('verified', {
  /** The kinds of badge, as the seal and the panel name them. */
  names: { payments: 'Payments', search: 'Search' },
  /** The seal's tooltip and name: "Verified · Payments". */
  sealLabel: (names: string) => `Verified · ${names}`,
  pillLabel: (names: string) => `Verified: ${names}. See what stands behind these numbers`,
  panel: 'Verified sources',
  // The owner's panel.
  title: (names: string) => `Verified · ${names}`,
  sub: 'Shown on your shared links too',
  // What someone with a shared link reads.
  viewerTitle: 'These numbers are real',
  viewerSub: (names: string) => `Confirmed by an independent source: ${names}`,
  verifyOwn: 'Verify your own site',
  // One row per badge: its name, then what it says.
  okSearch: (since: string, ago: string) => `Connected ${since} · synced ${ago}`,
  okSearchViewer: (ago: string) => `Owner verified with Google · synced ${ago}`,
  okPayments: (ago: string) => `Revenue from payments · last one ${ago}`,
  okPaymentsViewer: (provider: string) => `Revenue read from ${provider}, not typed in`,
  notSearch: 'Not counted: Search Console has not answered lately',
  notPayments: (provider: string) => `Not counted: nothing has arrived from ${provider} in 30 days`,
  connect: 'Connect',
  connectWhat: { payments: 'Stripe, PayPal, Paddle, Lemon Squeezy…', search: 'Google Search Console' },
  checked: (when: string) => `Last checked ${when}`,
  // The small badge on a card.
  badgeText: { payments: 'Payments verified', search: 'Search verified' },
  badge: (what: string) => `${what}: checked against the source itself`,
  // The site switcher's seal.
  seal: 'Verified by trckable',
})
