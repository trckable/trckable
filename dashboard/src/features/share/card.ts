import { sectionNamed } from '../../v2/explore/sections'
import { lang } from '../../i18n/lang'
import formats from './formats.json'

// What the studio asks the server for: a card is one address, so the preview, the download and the picture a
// shared link carries are the same card.

/** The picture's size, by id: the sizes are the one list the server draws by (formats.json, kept equal to cards.Formats). */
export type Shape = 'link' | 'square' | 'story' | 'wide' | 'post' | 'portrait'
export const FORMATS = formats as { id: Shape; w: number; h: number }[]
export const formatOf = (shape: Shape) => FORMATS.find((f) => f.id === shape) ?? FORMATS[0]

/** The cards the studio shows: each is a card template of the server. */
export type CardId = 'overview' | 'changed' | 'bestday' | 'milestone' | 'sources' | 'search' | 'toppage' | 'leaderboard'
/** What a card needs of the site; without it the card is not offered. */
export type Need = 'data' | 'changed' | 'bestday' | 'sources' | 'search'
export type Group = 'people' | 'milestones' | 'sources' | 'pages'
export type Period = '7d' | '30d' | '12mo' | 'all' | 'custom'
export const PERIODS: Period[] = ['7d', '30d', '12mo', 'all', 'custom']

/** A card, its group, what it needs, and the sections of a shared link it is drawn from (none when the headline numbers do). */
export type Card = { id: CardId; group: Group; need: Need | null; sections: string[] }
const ALL_SECTIONS = ['pages', 'sources', 'places', 'tech']
export const CARDS: Card[] = [
  { id: 'overview', group: 'people', need: 'data', sections: [] },
  { id: 'changed', group: 'people', need: 'changed', sections: ALL_SECTIONS },
  { id: 'bestday', group: 'people', need: 'bestday', sections: [] },
  { id: 'milestone', group: 'milestones', need: null, sections: [] },
  { id: 'sources', group: 'sources', need: 'sources', sections: ['sources'] },
  { id: 'search', group: 'sources', need: 'search', sections: ['sources'] },
  { id: 'toppage', group: 'pages', need: 'data', sections: ['pages'] },
  { id: 'leaderboard', group: 'pages', need: 'data', sections: ['pages'] },
]
export const GROUPS: Group[] = ['people', 'milestones', 'sources', 'pages']
/** The sections a link must show, and no more, to carry this card: a milestone of searches or countries is drawn from its own section. */
export function sectionsOf(l: Pick<Look, 'card' | 'ms'>): string[] {
  if (l.card !== 'milestone') return cardOf(l.card).sections
  const kind = l.ms?.split('~')[0]
  if (kind === 'search_clicks') return ['sources']
  return kind === 'countries' ? ['places'] : []
}

/**
 * The period a link is fixed to for a card, as the server keeps it: the card's own, none for a card with no span of time.
 * A range is `from..to`; all time is kept as its first day (`since:`), or sent as `all` for the server to read the day
 * when it is not known yet.
 */
export function linkPeriod(l: Pick<Look, 'card' | 'period' | 'from' | 'to'>, first?: string): string {
  if (!hasPeriod(l.card)) return ''
  if (l.period === 'custom') return l.from && l.to ? `${l.from}..${l.to}` : ''
  if (l.period === 'all') return first ? `since:${first}` : 'all'
  return l.period
}

export const cardOf = (id: CardId) => CARDS.find((c) => c.id === id) ?? CARDS[0]
/** A milestone has no span of time; every other card is drawn for a period. */
export const hasPeriod = (id: CardId) => id !== 'milestone'
/** Only the people card has a chart to switch off. */
export const hasChart = (id: CardId) => id === 'overview'

/** The cards the site can make, by group, in the order of the groups: a card needs what it needs, the milestone card needs a milestone reached, and a group with no card is left out. */
export const offered = (has: Record<Need, boolean>, reached: number): { group: Group; cards: CardId[] }[] =>
  GROUPS.map((group) => ({ group, cards: CARDS.filter((c) => c.group === group && (c.need ? has[c.need] : reached > 0)).map((c) => c.id) })).filter((g) => g.cards.length > 0)

/** The backgrounds: each is a theme and the server's background. Ink and Night grid, Glow and Ocean are dark cards; Paper and Sunset light ones. */
export type StyleId = 'ink' | 'paper' | 'grid' | 'glow' | 'sunset' | 'ocean'
export const STYLES: { id: StyleId; theme: 'dark' | 'light'; bg: 'solid' | 'grid' | 'gradient' | 'sunset' | 'ocean' }[] = [
  { id: 'ink', theme: 'dark', bg: 'solid' },
  { id: 'paper', theme: 'light', bg: 'solid' },
  { id: 'grid', theme: 'dark', bg: 'grid' },
  { id: 'glow', theme: 'dark', bg: 'gradient' },
  { id: 'sunset', theme: 'light', bg: 'sunset' },
  { id: 'ocean', theme: 'dark', bg: 'ocean' },
]
export const ACCENTS = ['#b8ff3c', '#4f8cff', '#ff5ca8', '#ffb547', '#2dd4bf', '#c792ff']

/** What a person picks: the card, its period and size, and the style (which is kept for the site). */
export type Look = { card: CardId; /** The milestone, as kind~step. */ ms?: string; shape: Shape; period: Period; /** The days of a custom range, from and to. */ from?: string; to?: string; style: StyleId; accent: string; name: boolean; date: boolean; chart: boolean; /** The site's hide-branding choice, only where it can change the picture: it makes the address new when it flips. */ hideBrand?: boolean }
export type Style = Pick<Look, 'style' | 'accent' | 'name' | 'date' | 'chart'>
export const DEFAULT_STYLE: Style = { style: 'ink', accent: ACCENTS[0], name: true, date: true, chart: true }

/** What a card says, in its own words: the facts a post is written from (the server's, never recalculated). */
export type Fact = { name: string; value: string }
export type Facts = { template: string; domain: string; big: string; label: string; /** The period's dates, or the day of a best day or milestone. */ foot: string; change?: string; dir?: number; vs?: string; rows?: Fact[]; stats?: Fact[]; /** Nothing behind the card: the post is the server's own line. */ empty?: boolean }

/** The numbers in words, and the post's text; the has_ flags say which cards the site can make. */
export type CardWords = { /** The site's first day with data, the earliest a period can start. */ first_day?: string; has_data: boolean; has_sources: boolean; has_changed: boolean; has_search: boolean; has_bestday: boolean; has_milestone: boolean; post: string; facts?: Facts }

/** What the site has to show, by what a card needs. */
export const hasOf = (w: CardWords | null): Record<Need, boolean> => ({ data: w?.has_data ?? true, sources: w?.has_sources ?? true, changed: w?.has_changed ?? true, search: w?.has_search ?? true, bestday: w?.has_bestday ?? true })

/** The choices that make the picture, as the card endpoint and a shared link's address read them. */
export function pictureParams(l: Look): URLSearchParams {
  const style = STYLES.find((s) => s.id === l.style) ?? STYLES[0]
  const p = new URLSearchParams({ t: l.card === 'overview' && !l.chart ? 'numbers' : l.card })
  p.set('period', l.period)
  if (l.period === 'custom' && l.from && l.to) {
    p.set('from', l.from)
    p.set('to', l.to)
  }
  if (l.ms && l.card === 'milestone') p.set('ms', l.ms)
  p.set('shape', l.shape)
  p.set('theme', style.theme)
  p.set('bg', style.bg)
  p.set('accent', l.accent)
  if (!l.date) p.set('date', '0')
  if (!l.name) p.set('name', '0')
  if (lang !== 'en') p.set('lang', lang) // the words, numbers and dates of the card and its post are the page's language
  return p
}

export function cardUrl(site: string, l: Look, format: 'png' | 'json' | 'thumb' = 'png'): string {
  const p = pictureParams(l)
  if (format === 'json') {
    // The post's text says what the card says: its words, not its look.
    for (const k of ['shape', 'theme', 'bg', 'accent', 'date', 'name']) p.delete(k)
    p.set('format', 'json')
    p.set('compare', '1') // the people card says its change against the period before
  } else {
    p.set('metric', 'visitors')
    if (format === 'thumb') {
      p.delete('shape') // the strip's pictures are the link preview's
      p.set('thumb', '1')
    }
    if (l.hideBrand !== undefined) p.set('brand', l.hideBrand ? '0' : '1')
  }
  return `/api/v1/sites/${encodeURIComponent(site)}/card?${p}`
}

/** The gallery topic an Explore section shares; the sections with no card have none. */
export type Topic = 'overview' | 'changed' | 'sources' | 'pages' | 'places' | 'tech' | 'search' | 'ai' | 'goals' | 'sales' | 'milestone'
const SECTION_TOPIC: Record<string, Topic> = { changed: 'changed', overview: 'overview', pages: 'pages', sources: 'sources', audience: 'places', goals: 'goals', web: 'ai' }
/** An old section id (search, places, tech, results, sales...) is read as the section it became. */
export const topicOfSection = (section: string): Topic | undefined => SECTION_TOPIC[sectionNamed(section) ?? section]

/** The card a topic opens the studio on: the topics with no card of their own open on the people card. */
const TOPIC_CARD: Partial<Record<Topic, CardId>> = { changed: 'changed', sources: 'sources', pages: 'toppage', search: 'search', milestone: 'milestone' }
export const cardOfTopic = (t?: Topic): CardId => (t && TOPIC_CARD[t]) || 'overview'

/** The card's period for the page's: a week or a day is a week, anything longer is a month. */
const PAGE_PERIOD = new Map<string, Period>([['today', '7d'], ['yesterday', '7d'], ['7d', '7d']])
export const periodOf = (page?: string): Period => PAGE_PERIOD.get(page ?? '') ?? '30d'

export const fileName = (domain: string, l: Look) => `trckable-${domain}-${l.card}${l.ms ? `-${l.ms.replace('~', '-')}` : ''}-${l.shape}${hasPeriod(l.card) ? `-${l.period === 'custom' ? `${l.from}_${l.to}` : l.period}` : ''}.png`
