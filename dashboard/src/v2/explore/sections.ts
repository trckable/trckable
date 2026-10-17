// Explore's ten sections in four groups, and the tables each one holds.
import type { FilterDim, Section, Tab } from './types'

export type { Section, Tab } from './types'

export const GROUPS: { key: 'traffic' | 'audience' | 'results' | 'site'; items: Section[] }[] = [
  { key: 'traffic', items: ['overview', 'pages', 'sources'] },
  { key: 'audience', items: ['places', 'tech'] },
  { key: 'results', items: ['results', 'sales'] },
  { key: 'site', items: ['speed', 'mentions', 'links', 'ai'] },
]

const SECTIONS: Section[] = GROUPS.flatMap((g) => g.items)

export const TABS: Record<Section, Tab[]> = {
  overview: ['overview', 'highlights', 'overtime', 'hours'],
  pages: ['pages', 'sells'],
  sources: ['sources', 'referrers', 'utm', 'search', 'earners'],
  places: ['countries', 'revmap', 'people'],
  tech: ['devices', 'browsers'],
  results: ['funnels', 'retention', 'vsale', 'toconvert', 'flow'],
  sales: ['sales', 'buyers'],
  speed: ['speed'],
  mentions: ['mentions'],
  links: ['outbound', 'bots'],
  ai: ['ai'],
}

export const sectionOf = (t: Tab): Section => SECTIONS.find((s) => TABS[s].includes(t)) ?? 'overview'

export const ALL_TABS: Tab[] = SECTIONS.flatMap((s) => TABS[s])

/** Whether an address's word for a table (?x=pages) is one. */
export const isTab = (v: string | undefined): v is Tab => !!v && (ALL_TABS as string[]).includes(v)

export const FILTER_DIMS: FilterDim[] = ['referrer', 'page', 'country', 'device']

/** What a table's rows filter by when a row is tapped. */
export const ROW_DIM: Partial<Record<Tab, FilterDim>> = { pages: 'page', sources: 'referrer', referrers: 'referrer', utm: 'referrer', countries: 'country', devices: 'device' }

/** The tabs whose numbers their own card reads (views/Hosted.tsx). */
export const HOSTED: Tab[] = ['highlights', 'overtime', 'hours', 'revmap', 'earners', 'sells', 'people', 'buyers', 'retention', 'vsale', 'toconvert', 'flow', 'ai']
