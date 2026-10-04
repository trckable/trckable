// Every word the AI assistants & crawlers card shows, in one place: the
// dashboard's text moves to message files when translations come, and this is
// what moves.
import { defineCopy } from '../../i18n'


export type CrawlKind = 'answer' | 'train' | 'index'

export const KINDS: readonly { id: CrawlKind; label: string; what: string }[] = defineCopy('crawlers.kinds', [
  { id: 'answer', label: 'AI assistants', what: 'Fetched by an assistant to answer someone right now' },
  { id: 'train', label: 'Training crawlers', what: 'Collected as training data' },
  { id: 'index', label: 'Search bots', what: 'Crawled so your pages can be found' },
])

export const copy = defineCopy('crawlers', {
  title: 'AI assistants & crawlers',
  tabs: 'What the robot wanted',
  feed: 'How to feed this',
  empty: 'Nothing yet. Robots never reach the browser script, so your server forwards them: see “How to feed this”.',
  over: (label: string) => `${label} over time`,
  none: (label: string) => `No ${label.toLowerCase()} in this period.`,
  errors: (n: string, many: boolean) => `${n} ${many ? 'requests' : 'request'} hit an error page`,
  pages: 'Pages read',
  page: 'Page',
  bot: 'Robot',
  hits: 'Hits',
  other: 'Other pages',
  folded: (n: string) => `${n} hits counted without their page (fair use)`,
  setup: {
    label: 'Connect crawler data',
    title: 'Connect crawler data',
    hint: 'Robots run no JavaScript: your server or CDN reports them.',
    help: 'Only the robot’s name, the page and the time are sent. No address, no cookie, no visitor.',
    steps: ['Where does your site run?', 'Copy this', 'Turn it on'],
    options: [
      { id: 'cloudflare', label: 'Cloudflare' },
      { id: 'vercel', label: 'Vercel' },
      { id: 'nginx', label: 'Nginx' },
      { id: 'caddy', label: 'Caddy' },
      { id: 'other', label: 'Other' },
    ] as const,
    captions: {
      worker: 'A Worker, run after the page has gone out',
      middleware: 'Middleware, run after the response has gone',
      mirror: 'Mirror: no extra process, no status',
      log: 'Log and forwarder: reports the status too',
      caddy: 'Log and forwarder',
      curl: 'One POST per robot request',
    },
    key: 'Key',
    keyHint: 'Save it as TRCKABLE_PROXY_KEY',
    on: 'Turn on',
    waiting: 'Waiting for the first robot',
    arrived: (n: string) => `${n} hits arrived`,
    docs: 'Docs',
    done: 'Done',
  },
})

/** The row the server folds pages into past fair use. */
export const OTHER = '(other)'
