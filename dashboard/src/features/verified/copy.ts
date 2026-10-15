// The Verified seal's words: the pill, its panel, the badges on cards and the
// switcher's seal. The sources themselves come from the server (model.ts).
import { defineCopy } from '../../i18n'

const sources = (n: number) => (n === 1 ? '1 source' : `${n} sources`)

export const copy = defineCopy('verified', {
  pill: (n: number) => `Verified · ${n}`,
  pillShort: (n: number) => `${n}`,
  pillLabel: (n: number) => `Verified by ${sources(n)}: see what stands behind these numbers`,
  panel: 'Verified sources',
  // The owner's panel.
  title: (n: number) => `Verified by ${sources(n)}`,
  sub: 'Shown on your shared links too',
  // What someone with a shared link reads.
  viewerTitle: 'These numbers are real',
  viewerSub: (n: number) => `Checked by trckable against ${sources(n)}`,
  verifyOwn: 'Verify your own site',
  // One row per source: its name, then what it says.
  name: { snippet: 'trckable on the site', gsc: 'Google Search Console' },
  okSnippet: 'Snippet found, visits arriving now',
  okSnippetViewer: 'Counted on the site itself, live',
  okSearch: (since: string, ago: string) => `Connected ${since} · synced ${ago}`,
  okSearchViewer: (ago: string) => `Owner verified with Google · synced ${ago}`,
  okPayments: (ago: string) => `Revenue from payments · last one ${ago}`,
  okPaymentsViewer: (provider: string) => `Revenue read from ${provider}, not typed in`,
  notSnippet: 'Not counted: the snippet is missing, or no visit arrived in the last day',
  notSearch: 'Not counted: Search Console has not answered lately',
  notPayments: (provider: string) => `Not counted: nothing has arrived from ${provider} in 30 days`,
  connect: 'Connect',
  connectHint: 'Connect one to add its badge',
  checked: (when: string) => `Last checked ${when}`,
  // The small badge on a card.
  live: 'Live',
  searchConsole: 'Search Console',
  badge: (what: string) => `Verified: ${what}`,
  // The site switcher's seal.
  seal: 'Verified by trckable',
})
