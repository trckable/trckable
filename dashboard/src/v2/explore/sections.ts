// Explore's ten sections in four groups, and the tables each one holds.
import type { FilterDim, Section, Tab } from './types'

export const GROUPS: { key: 'traffic' | 'audience' | 'results' | 'site'; items: Section[] }[] = [
  { key: 'traffic', items: ['overview', 'pages', 'sources'] },
  { key: 'audience', items: ['places', 'tech'] },
  { key: 'results', items: ['results', 'sales'] },
  { key: 'site', items: ['speed', 'mentions', 'links'] },
]

export const SECTIONS: Section[] = GROUPS.flatMap((g) => g.items)

export const TABS: Record<Section, Tab[]> = {
  overview: ['overview'],
  pages: ['pages'],
  sources: ['sources', 'referrers', 'utm', 'search'],
  places: ['countries'],
  tech: ['devices', 'browsers'],
  results: ['funnels'],
  sales: ['sales'],
  speed: ['speed'],
  mentions: ['mentions'],
  links: ['outbound', 'bots'],
}

export const sectionOf = (t: Tab): Section => SECTIONS.find((s) => TABS[s].includes(t)) ?? 'overview'

export const FILTER_DIMS: FilterDim[] = ['referrer', 'page', 'country', 'device']

/** What a table's rows filter by when a row is tapped. */
export const ROW_DIM: Partial<Record<Tab, FilterDim>> = { pages: 'page', sources: 'referrer', referrers: 'referrer', utm: 'referrer', countries: 'country', devices: 'device' }
