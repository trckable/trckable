import formats from './formats.json'

// What the dialog asks the server for: a card is one address, so the preview
// and the download are the same picture.
export type Template = 'overview' | 'numbers' | 'grid' | 'leaderboard' | 'toppage' | 'sources' | 'topsource' | 'places' | 'topplace' | 'devices' | 'browsers' | 'changed' | 'search' | 'ai' | 'goals' | 'sales' | 'milestone'
/** A group of pictures in the gallery. */
export type Topic = 'overview' | 'changed' | 'sources' | 'pages' | 'places' | 'tech' | 'search' | 'ai' | 'goals' | 'sales' | 'milestone'
/** What a picture needs of the site; without it the picture is shown disabled, with the reason. */
export type Need = 'revenue' | 'data' | 'sources' | 'places' | 'tech' | 'changed' | 'search' | 'ai' | 'goals' | 'milestone'
export type Period = '24h' | '7d' | '30d' | 'all' | 'custom'
export type Metric = 'visitors' | 'pageviews' | 'engaged' | 'revenue'
/** The small numbers under the chart: the ones that are also a metric are not offered while it is the big number. */
export type Stat = 'engaged' | 'avgtime' | 'pageviews' | 'visitors' | 'bounce' | 'country' | 'page' | 'source' | 'revenue'
export type Theme = 'dark' | 'light'
/** The picture's size: the link preview (1.91:1), square, story (9:16) or wide (16:9). */
/** The background of the picture. */
export type Bg = 'gradient' | 'solid' | 'grid'
export const BACKGROUNDS: Bg[] = ['gradient', 'solid', 'grid']
export type Shape = 'link' | 'square' | 'story' | 'wide'

/** The sizes, from the one list the server draws by (formats.json, kept equal to cards.Formats). */
export const FORMATS = formats as { id: Shape; w: number; h: number }[]
export const formatOf = (shape: Shape) => FORMATS.find((f) => f.id === shape) ?? FORMATS[0]

/** The gallery: every picture, in its topic. A topic's pictures come first-to-last as listed. */
export type Picture = { id: Template; topic: Topic; need?: Need }
export const PICTURES: Picture[] = [
  { id: 'overview', topic: 'overview', need: 'data' },
  { id: 'numbers', topic: 'overview', need: 'data' },
  { id: 'grid', topic: 'overview', need: 'data' },
  { id: 'changed', topic: 'changed', need: 'changed' },
  { id: 'sources', topic: 'sources', need: 'sources' },
  { id: 'topsource', topic: 'sources', need: 'sources' },
  { id: 'leaderboard', topic: 'pages', need: 'data' },
  { id: 'toppage', topic: 'pages', need: 'data' },
  { id: 'places', topic: 'places', need: 'places' },
  { id: 'topplace', topic: 'places', need: 'places' },
  { id: 'devices', topic: 'tech', need: 'tech' },
  { id: 'browsers', topic: 'tech', need: 'tech' },
  { id: 'search', topic: 'search', need: 'search' },
  { id: 'ai', topic: 'ai', need: 'ai' },
  { id: 'goals', topic: 'goals', need: 'goals' },
  { id: 'sales', topic: 'sales', need: 'revenue' },
  { id: 'milestone', topic: 'milestone', need: 'milestone' },
]
export const TOPICS: Topic[] = ['overview', 'changed', 'sources', 'pages', 'places', 'tech', 'search', 'ai', 'goals', 'sales', 'milestone']
export const picturesOf = (t: Topic) => PICTURES.filter((p) => p.topic === t)
/** What the picture lacks on this site, if anything (it is then disabled, saying why). */
export const missing = (p: Picture, has: Record<Need, boolean>): Need | null => (p.need && !has[p.need] ? p.need : null)
/** Whether the Numbers section (the big number and the small stats) applies to the picture. */
export const hasNumbers = (t: Template) => t === 'overview' || t === 'numbers'
export const METRICS: Metric[] = ['visitors', 'pageviews', 'engaged', 'revenue']
export const STATS: Stat[] = ['engaged', 'avgtime', 'pageviews', 'visitors', 'bounce', 'country', 'page', 'source', 'revenue']
export const MAX_STATS = 3
export const DEFAULT_STATS: Stat[] = ['engaged', 'avgtime', 'country']
export const PERIODS: Period[] = ['24h', '7d', '30d', 'all', 'custom']
/** The swatches: the site's own colour first, when it has one. */
export const ACCENTS = ['#b8ff3c', '#4f8cff', '#ff5ca8', '#ffb547', '#2dd4bf']

export type Look = { template: Template; shape: Shape; period: Period; /** A custom range's first and last day. */ range?: { from: string; to: string }; /** The change against the period just before, in a pill. Off by default; nothing before all time. */ compare: boolean; metric: Metric; stats: Stat[]; theme: Theme; accent: string; /** The site's hide-branding choice, only where it can change the picture: it makes the address new when it flips. */ hideBrand?: boolean; /** The background; the gradient when missing. */ bg?: Bg; /** Leave the period off the picture. */ hideDate?: boolean; /** Leave the site's name off the picture. */ hideName?: boolean }

/** The numbers in words, and the post's text. */
export type CardWords = { metric: Metric; big: string; label: string; foot: string; revenue: boolean; has_data: boolean; has_sources: boolean; has_places: boolean; has_tech: boolean; has_changed: boolean; has_search: boolean; has_ai: boolean; has_goals: boolean; has_milestone: boolean; post: string }

/** What the site has to show, by what a picture needs. */
export const hasOf = (w: CardWords | null): Record<Need, boolean> => ({ revenue: w?.revenue ?? false, data: w?.has_data ?? true, sources: w?.has_sources ?? true, places: w?.has_places ?? true, tech: w?.has_tech ?? true, changed: w?.has_changed ?? true, search: w?.has_search ?? true, ai: w?.has_ai ?? true, goals: w?.has_goals ?? true, milestone: w?.has_milestone ?? true })

export function cardUrl(site: string, l: Look, format: 'png' | 'json' | 'thumb' = 'png'): string {
  const p = new URLSearchParams({ period: l.period, metric: l.metric })
  if (l.period === 'custom' && l.range) {
    p.set('from', l.range.from)
    p.set('to', l.range.to)
  }
  if (format === 'json') {
    p.set('format', 'json')
    p.set('t', l.template) // the post's text says what its picture says
  }
  else {
    if (format === 'thumb') p.set('thumb', '1')
    if (comparing(l)) p.set('compare', '1')
    p.set('t', l.template)
    if (l.shape !== 'link') p.set('shape', l.shape)
    p.set('theme', l.theme)
    p.set('accent', l.accent)
    if (l.bg && l.bg !== 'gradient') p.set('bg', l.bg)
    if (l.hideDate) p.set('date', '0')
    if (l.hideName) p.set('name', '0')
    p.set('stats', l.stats.join(','))
    if (l.hideBrand !== undefined) p.set('brand', l.hideBrand ? '0' : '1')
  }
  return `/api/v1/sites/${encodeURIComponent(site)}/card?${p}`
}

/** Whether the picture carries a comparison: asked for, and there is a period before (not for all time). */
export const comparing = (l: Pick<Look, 'compare' | 'period'>) => l.compare && l.period !== 'all'

/** Whether the dialog gives the picture or the post's text. */
export type Mode = 'picture' | 'text'

/** The gallery topic an Explore section shares; the sections with no picture have none. */
const SECTION_TOPIC: Record<string, Topic> = { changed: 'changed', overview: 'overview', pages: 'pages', sources: 'sources', search: 'search', places: 'places', tech: 'tech', results: 'goals', sales: 'sales', ai: 'ai' }
export const topicOfSection = (section: string): Topic | undefined => SECTION_TOPIC[section]

/** The card's period for the page's: a day is the last 24 hours, a week or a month is itself, anything longer is a month. */
const PAGE_PERIOD = new Map<string, Period>([['today', '24h'], ['yesterday', '24h'], ['7d', '7d']])
export const periodOf = (page?: string): Period => PAGE_PERIOD.get(page ?? '') ?? '30d'

export const fileName = (domain: string, l: Look) => `trckable-${domain}-${l.template}${l.shape === 'link' ? '' : `-${l.shape}`}-${l.period === 'custom' && l.range ? `${l.range.from}_${l.range.to}` : l.period}.png`

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
