// Every word of the AI & Search tab, its badges and the guide card about it.
// One place, for when the dashboard's words move to message files.
import { defineCopy } from '../../i18n'
import { fmtCompact, fmtInt } from '../../lib/format'

const times = (n: number) => `${fmtInt(n)} ${n === 1 ? 'time' : 'times'}`
const people = (n: number) => (n === 0 ? 'nobody' : `${fmtInt(n)} ${n === 1 ? 'person' : 'people'}`)
const visitors = (n: number) => `${fmtInt(n)} ${n === 1 ? 'visitor' : 'visitors'}`

const kind: Record<string, string> = { answer: 'answers', train: 'training', index: 'search' }

export const aiCopy = defineCopy('aisearch', {
  label: 'Google, AI assistants and AI crawlers',
  failed: 'Couldn’t read AI & Search.',
  google: 'Google',
  assistants: 'AI assistants',
  assistantsHead: 'Assistants: what they read, what they send',
  crawlers: 'Crawlers',
  assistant: 'Assistant',
  crawler: 'Crawler',
  page: 'Page',
  search: 'Search',
  clicks: 'Clicks',
  hits: 'Hits',
  blockedHead: 'Blocked / failed',
  noFailures: '–',
  failTitle: (blocked: number, broken: number) => `${fmtInt(blocked)} blocked by your server or CDN · ${fmtInt(broken)} broken pages`,
  visitors: 'Visitors',
  connect: 'Connect',
  connectLabel: 'Connect Search Console',
  noAssistants: 'None in this period.',
  ignored: (dims: string[]) => `Google can’t apply the ${dims.join(', ')} filter, so it’s left out here.`,
  noGoogle: 'No searches in this period.',
  whyGoogle: 'The Google searches that brought people to you, by clicks. From Search Console, 2–3 days behind.',
  whyAssistants: 'Fetches are what the assistant’s robots read of your site. Visitors are people who clicked a link to you in its answers.',
  whyBots: 'AI bots that read your pages to learn about you, and how often.',
  whyPages: 'Which pages AI bots read, and how many visits each one then sent.',
  connectHint: 'Then this shows the Google searches that brought people to you.',
  setupHint: 'Connect crawler data to see which AI bots read your pages.',
  seeSearch: 'See all searches',
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
  fetches: 'Fetches',
  /** Under an assistant's name: what its robots read for each person it sent. */
  returnPer: (n: number) => `1 visitor per ${fmtInt(n)} ${n === 1 ? 'fetch' : 'fetches'}`,
  returnNobody: 'Read you, sent nobody',
  noCompare: 'Robots can’t be filtered; clear filters to compare.',
  noRobots: 'Without crawler data only the visitors show, not what each assistant reads.',
  headline: {
    requests: 'AI bot requests',
    requestsSub: 'in this period',
    perVisitor: 'Bots per visitor',
    perVisitorSub: 'for each human visitor',
    noVisitors: 'No visitors yet',
    topCompany: 'Top company',
    topCompanySub: (n: number) => `${fmtCompact(n)} requests`,
    sent: 'Sent by AI assistants',
    sentSub: 'visitors',
  },
  improve: 'How to improve',
  whyImprove: 'What your numbers show, and one thing to do about each.',
  tip: {
    connect: {
      title: 'No AI crawler data yet',
      why: 'Connect it to see which bots read your pages, how often, and whether anything they ask for is broken.',
      go: 'Connect crawler data',
    },
    broken: {
      title: (company: string, n: number) => `${company} got an error page ${times(n)}`,
      why: (pages: string) => `Its bot asked for pages that return an error, so it learns nothing from them.${pages ? ` Worst: ${pages}.` : ''}`,
      go: 'See the crawlers',
    },
    credit: {
      title: (name: string, fetches: number, visitors: number) => `${name} read you ${times(fetches)} and sent ${people(visitors)}`,
      why: (page: string) => `It reads a lot and credits little.${page ? ` The page it read most is ${page}: make sure its first lines answer the question plainly.` : ''}`,
      go: 'Open the page',
      goNone: 'See the pages',
    },
    blocked: {
      title: (n: number) => `Your server turned away AI bots ${times(n)}`,
      why: (names: string) => `${names}: refused with a 401, 403 or 429. A bot that is turned away cannot read or credit you. If you want to be read, allow it.`,
      go: 'See the crawlers',
    },
    unread: {
      title: (n: number) => `Among your top pages, ${fmtInt(n)} Google ranks ${n === 1 ? 'was' : 'were'} never read by AI`,
      why: (pages: string) => `No AI bot fetched these in this period: ${pages}. Check your robots.txt and sitemap.`,
      go: 'List the pages',
    },
  },
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

/** The dialog behind the guide card. */
export const aiModalCopy = defineCopy('aisearch.modal', {
  visitors: 'visitors from AI',
  crawled: 'reads by AI crawlers',
  landed: 'Landed on',
  readPages: 'Pages read',
  when: 'When',
  whenLabel: 'AI visitors for each day of the period',
  meansVisitor: 'An AI assistant named your site in an answer, and a person followed the link.',
  meansCrawler: 'AI crawlers are robots. They read your pages to answer or train, and they are not counted as visitors.',
  seeAll: 'See all in AI & Search',
  reads: (n: number) => `${fmtInt(n)} ${n === 1 ? 'read' : 'reads'}`,
})
