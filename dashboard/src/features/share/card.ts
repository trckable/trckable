// What the dialog asks the server for: a card is one address, so the preview
// and the download are the same picture.
export type Template = 'overview' | 'leaderboard' | 'post'
export type Period = '24h' | '7d' | '30d'
export type Metric = 'visitors' | 'pageviews' | 'engaged' | 'revenue'
/** The small numbers under the chart: the ones that are also a metric are not offered while it is the big number. */
export type Stat = 'engaged' | 'avgtime' | 'pageviews' | 'visitors' | 'bounce' | 'country' | 'page' | 'source' | 'revenue'
export type Theme = 'dark' | 'light'

export const TEMPLATES: Template[] = ['overview', 'leaderboard', 'post']
export const METRICS: Metric[] = ['visitors', 'pageviews', 'engaged', 'revenue']
export const STATS: Stat[] = ['engaged', 'avgtime', 'pageviews', 'visitors', 'bounce', 'country', 'page', 'source', 'revenue']
export const MAX_STATS = 3
export const DEFAULT_STATS: Stat[] = ['engaged', 'avgtime', 'country']
export const PERIODS: Period[] = ['24h', '7d', '30d']
/** The swatches: the site's own colour first, when it has one. */
export const ACCENTS = ['#b8ff3c', '#4f8cff', '#ff5ca8', '#ffb547', '#2dd4bf']

export type Look = { template: Template; period: Period; metric: Metric; stats: Stat[]; theme: Theme; accent: string; /** The site's hide-branding choice, only where it can change the picture: it makes the address new when it flips. */ hideBrand?: boolean }

/** The numbers in words, and the post's text. */
export type CardWords = { metric: Metric; big: string; label: string; foot: string; revenue: boolean; has_data: boolean; post: string }

export function cardUrl(site: string, l: Look, format: 'png' | 'json' = 'png'): string {
  const p = new URLSearchParams({ period: l.period, metric: l.metric })
  if (format === 'json') p.set('format', 'json')
  else {
    p.set('t', l.template)
    p.set('theme', l.theme)
    p.set('accent', l.accent)
    p.set('stats', l.stats.join(','))
    if (l.hideBrand !== undefined) p.set('brand', l.hideBrand ? '0' : '1')
  }
  return `/api/v1/sites/${encodeURIComponent(site)}/card?${p}`
}

/** The card's period for the page's: a day is the last 24 hours, a week or a month is itself, anything longer is a month. */
const PAGE_PERIOD = new Map<string, Period>([['today', '24h'], ['yesterday', '24h'], ['7d', '7d']])
export const periodOf = (page?: string): Period => PAGE_PERIOD.get(page ?? '') ?? '30d'

export const fileName = (domain: string, l: Look) => `trckable-${domain}-${l.template}-${l.period}.png`

/** The accent on the card: a swatch, or the theme's own when none fits the light card. */
export const accentsFor = (color?: string) => (color && /^#[0-9a-f]{6}$/i.test(color) && !ACCENTS.includes(color.toLowerCase()) ? [color.toLowerCase(), ...ACCENTS] : ACCENTS)

/** The stats that may be picked beside this big number: not itself, and revenue only where the site has it. */
export const statsFor = (metric: Metric, revenue: boolean): Stat[] => STATS.filter((s) => s !== metric && (s !== 'revenue' || revenue))

/** A stat picked or put away: at most three (a fourth pushes out the oldest), never none. */
export function toggleStat(stats: Stat[], s: Stat): Stat[] {
  if (stats.includes(s)) return stats.length > 1 ? stats.filter((x) => x !== s) : stats
  return [...stats, s].slice(-MAX_STATS)
}

/** The stats once `metric` is the big number: it is not shown twice; with none left, the defaults. */
export function statsWith(stats: Stat[], metric: Metric): Stat[] {
  const left = stats.filter((s) => s !== metric)
  return left.length ? left : DEFAULT_STATS.filter((s) => s !== metric)
}
