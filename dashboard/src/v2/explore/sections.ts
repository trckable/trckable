// Explore's sections in four groups, and the tables each one holds.
import { hasAnswers, hasMentions, isShared } from '../../lib/me'
import type { FilterDim, Section, Tab } from './types'

export type { Section, Tab } from './types'

const ALL_GROUPS: { key: 'traffic' | 'audience' | 'results' | 'site'; items: Section[] }[] = [
  { key: 'traffic', items: ['changed', 'overview', 'pages', 'sources', 'search'] },
  { key: 'audience', items: ['places', 'tech'] },
  { key: 'results', items: ['results', 'sales'] },
  { key: 'site', items: ['speed', 'mentions', 'links', 'ai', 'answers'] },
]

const SECTIONS: Section[] = ALL_GROUPS.flatMap((g) => g.items)

const EVERY: Record<Section, Tab[]> = {
  changed: ['changed'],
  overview: ['overview', 'highlights', 'overtime', 'hours'],
  pages: ['pages', 'paths', 'entries', 'exits', 'groups', 'sells'],
  sources: ['sources', 'quality', 'earners', 'referrers', 'utm'],
  search: ['search'],
  places: ['countries', 'regions', 'cities', 'timezones', 'languages', 'revmap', 'people'],
  tech: ['devices', 'browsers', 'networks', 'bversion', 'screens'],
  results: ['funnels', 'retention', 'vsale', 'toconvert', 'flow'],
  sales: ['sales', 'payments', 'customers'],
  speed: ['speed'],
  mentions: ['mentions'],
  links: ['outbound', 'bots'],
  ai: ['ai'],
  answers: ['answers'],
}

/** What a shared link can read: the report alone (the public endpoint answers nothing else), so its tables and the payments the report carries. */
const SHARED: Tab[] = ['overview', 'pages', 'sources', 'referrers', 'utm', 'countries', 'devices', 'browsers', 'sales', 'earners']

let networksSeen = false
/** Networks is offered once a visit of the period named its provider (an instance without the network database, and a site that drops region and city, never do). */
export const seeNetworks = (on: boolean) => {
  networksSeen = on
}

/** Whether a table is offered here: all of them, but on a shared link only those the report can fill. */
export const offered = (t: Tab): boolean => (t !== 'mentions' || hasMentions()) && (t !== 'networks' || networksSeen) && (t !== 'answers' || hasAnswers()) && (!isShared() || SHARED.includes(t))

/** A section's tables, as offered here. */
export const TABS = Object.fromEntries(SECTIONS.map((s) => [s, []])) as unknown as Record<Section, Tab[]>
for (const sec of SECTIONS) Object.defineProperty(TABS, sec, { get: () => EVERY[sec].filter(offered), enumerable: true })

/** The groups of sections, those that have a table to offer. */
export const groups = () => ALL_GROUPS.map((g) => ({ ...g, items: g.items.filter((sec) => TABS[sec].length > 0) })).filter((g) => g.items.length > 0)

export const sectionOf = (t: Tab): Section => SECTIONS.find((s) => EVERY[s].includes(t)) ?? 'overview'

/** Where a section leads next: the sections that answer the question it raises. */
const RELATED: Record<Section, Section[]> = {
  changed: ['overview', 'pages', 'sources'],
  overview: ['pages', 'sources', 'places'],
  pages: ['sources', 'results', 'speed'],
  sources: ['places', 'results', 'sales'],
  search: ['pages', 'sources'],
  places: ['tech', 'sources'],
  tech: ['places', 'speed'],
  results: ['pages', 'sales'],
  sales: ['sources', 'results'],
  speed: ['pages', 'tech'],
  mentions: ['sources', 'ai'],
  links: ['pages', 'ai'],
  ai: ['mentions', 'sources'],
  answers: ['ai', 'mentions'],
}
export const relatedTo = (s: Section): Section[] => RELATED[s].filter((r) => TABS[r].length > 0)

export const ALL_TABS: Tab[] = SECTIONS.flatMap((s) => EVERY[s])

/** Whether an address's word for a table (?x=pages) is one. A link to Networks is followed before the report says whether any visit named a provider; the table then says it has none. */
export const isTab = (v: string | undefined): v is Tab => !!v && (ALL_TABS as string[]).includes(v) && (v === 'networks' || offered(v as Tab))

/** The tables that set two periods side by side; the rest read this period alone. */
export const compares = (t: Tab) => !HOSTED.includes(t) && !['speed', 'outbound', 'mentions', 'answers', 'sales', 'quality', 'paths', 'networks'].includes(t)

export const FILTER_DIMS: FilterDim[] = ['referrer', 'page', 'country', 'device']

/** What a table's rows filter by when a row is tapped. */
export const ROW_DIM: Partial<Record<Tab, FilterDim>> = { pages: 'page', sources: 'referrer', referrers: 'referrer', utm: 'referrer', countries: 'country', devices: 'device' }

/** The tabs whose numbers their own card reads (views/Hosted.tsx). */
export const HOSTED: Tab[] = ['highlights', 'overtime', 'hours', 'revmap', 'earners', 'sells', 'people', 'payments', 'customers', 'retention', 'vsale', 'toconvert', 'flow', 'ai', 'answers']
