// Every word the AI assistants & crawlers card shows, in one place: the
// dashboard's text moves to message files when translations come, and this is
// what moves.

export type CrawlKind = 'answer' | 'train' | 'index'

export const KINDS: readonly { id: CrawlKind; label: string; what: string }[] = [
  { id: 'answer', label: 'AI assistants', what: 'Fetched by an assistant to answer someone right now' },
  { id: 'train', label: 'Training crawlers', what: 'Collected as training data' },
  { id: 'index', label: 'Search bots', what: 'Crawled so your pages can be found' },
]

export const copy = {
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
  help: {
    label: 'Report crawlers',
    title: 'Let your server report robots',
    hint: 'Crawlers run no JavaScript: count them from your server.',
    help: 'One middleware sends the path and the user agent, never visitor data.',
    note: 'Only robots trckable recognises are counted, per day and page. No IP, no cookie.',
    done: 'Done',
  },
}

/** The row the server folds pages into past fair use. */
export const OTHER = '(other)'
