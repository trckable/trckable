// Explore's ten sections in four groups, and the tables each one holds.
import { hasAnswers, hasMentions, isShared } from '../../lib/me'
import type { FilterDim, Section, Tab } from './types'

export type { Section, Tab } from './types'

const ALL_GROUPS: { key: 'traffic' | 'audience' | 'results' | 'site'; items: Section[] }[] = [
  { key: 'traffic', items: ['overview', 'pages', 'sources'] },
  { key: 'audience', items: ['places', 'tech'] },
  { key: 'results', items: ['results', 'sales'] },
  { key: 'site', items: ['speed', 'mentions', 'links', 'ai', 'answers'] },
]

const SECTIONS: Section[] = ALL_GROUPS.flatMap((g) => g.items)

const EVERY: Record<Section, Tab[]> = {
  overview: ['overview', 'highlights', 'overtime', 'hours'],
  pages: ['pages', 'exits', 'groups', 'sells'],
  sources: ['sources', 'referrers', 'utm', 'search', 'earners'],
  places: ['countries', 'regions', 'cities', 'languages', 'revmap', 'people'],
  tech: ['devices', 'browsers', 'bversion', 'screens'],
  results: ['funnels', 'retention', 'vsale', 'toconvert', 'flow'],
  sales: ['sales', 'buyers'],
  speed: ['speed'],
  mentions: ['mentions'],
  links: ['outbound'],
  ai: ['ai', 'bots'],
  answers: ['answers'],
}

/** What a shared link can read: the report alone (the public endpoint answers nothing else), so its tables and the payments the report carries. */
const SHARED: Tab[] = ['overview', 'pages', 'sources', 'referrers', 'utm', 'countries', 'devices', 'browsers', 'sales', 'earners']

/** Whether a table is offered here: all of them, but on a shared link only those the report can fill. */
export const offered = (t: Tab): boolean => (t !== 'mentions' || hasMentions()) && (t !== 'answers' || hasAnswers()) && (!isShared() || SHARED.includes(t))

/** A section's tables, as offered here. */
export const TABS = Object.fromEntries(SECTIONS.map((s) => [s, []])) as unknown as Record<Section, Tab[]>
for (const sec of SECTIONS) Object.defineProperty(TABS, sec, { get: () => EVERY[sec].filter(offered), enumerable: true })

/** The groups of sections, those that have a table to offer. */
export const groups = () => ALL_GROUPS.map((g) => ({ ...g, items: g.items.filter((sec) => TABS[sec].length > 0) })).filter((g) => g.items.length > 0)

export const sectionOf = (t: Tab): Section => SECTIONS.find((s) => EVERY[s].includes(t)) ?? 'overview'

export const ALL_TABS: Tab[] = SECTIONS.flatMap((s) => EVERY[s])

/** Whether an address's word for a table (?x=pages) is one. */
export const isTab = (v: string | undefined): v is Tab => !!v && (ALL_TABS as string[]).includes(v) && offered(v as Tab)

export const FILTER_DIMS: FilterDim[] = ['referrer', 'page', 'country', 'device']

/** What a table's rows filter by when a row is tapped. */
export const ROW_DIM: Partial<Record<Tab, FilterDim>> = { pages: 'page', sources: 'referrer', referrers: 'referrer', utm: 'referrer', countries: 'country', devices: 'device' }

/** The tabs whose numbers their own card reads (views/Hosted.tsx). */
export const HOSTED: Tab[] = ['highlights', 'overtime', 'hours', 'revmap', 'earners', 'sells', 'people', 'buyers', 'retention', 'vsale', 'toconvert', 'flow', 'ai', 'answers']
