// Every word of the AI & Search tab, its badges and the guide card about it.
// One place, for when the dashboard's words move to message files.
import { defineCopy } from '../../i18n'
import { fmtInt } from '../../lib/format'

const times = (n: number) => `${fmtInt(n)} ${n === 1 ? 'time' : 'times'}`
const visitors = (n: number) => `${fmtInt(n)} ${n === 1 ? 'visitor' : 'visitors'}`

const kind: Record<string, string> = { answer: 'answers', train: 'training' }

export const aiCopy = defineCopy('aisearch', {
  tab: 'AI & Search',
  label: 'Google, AI assistants and AI crawlers',
  failed: 'Couldn’t read AI & Search.',
  google: 'Google',
  assistants: 'AI assistants',
  crawlers: 'AI crawlers',
  assistant: 'Assistant',
  crawler: 'Crawler',
  page: 'Page',
  search: 'Search',
  clicks: 'Clicks',
  hits: 'Hits',
  visitors: 'Visitors',
  connect: 'Connect',
  connectLabel: 'Connect Search Console',
  noAssistants: 'None in this period.',
  ignored: (dims: string[]) => `Google can’t apply the ${dims.join(', ')} filter, so it’s left out here.`,
  noGoogle: 'No searches in this period.',
  setup: 'Connect crawler data',
  kind,
  pickAssistant: (name: string, host: string) => `${name}: filter by ${host}`,
  botTitle: (name: string, hits: number) => `${name}: ${fmtInt(hits)} hits`,
  pickPage: (path: string) => `${path}: filter by this page`,
  /** What a page row says, whole: the numbers are small on screen. */
  ratio: (path: string, read: number, sent: number) => `${path}: AI read this ${times(read)}, sent ${visitors(sent)}`,
  readTitle: (n: number) => `Read ${times(n)} by AI crawlers`,
  sentTitle: (n: number) => `${visitors(n)} sent by AI assistants`,
  pages: 'Pages',
  flag: {
    uncredited: 'No credit',
    unread: 'Not read',
    uncreditedWhy: (read: number) => `AI crawlers read this page ${times(read)} and sent nobody. It may be used without a link back.`,
    unreadWhy: (clicks: number) => `Google sent ${fmtInt(clicks)} clicks to this page and no AI crawler read it in this period.`,
  },
})

/** The guide card, on the first AI visitor or the first AI crawler. */
export const guideCopy = defineCopy('aisearch.guide', {
  visitor: { label: 'AI & Search', title: 'An AI assistant sent a visitor', body: 'See which assistants, and which pages.', go: 'Open AI & Search' },
  crawler: { label: 'AI & Search', title: 'An AI crawler read your site', body: 'See which robots, and which pages.', go: 'Open AI & Search' },
})
