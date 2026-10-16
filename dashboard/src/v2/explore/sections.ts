// Explore's ten sections in four groups, and the tabs inside the ones that have more than one. The walkthrough's
// own list: people and trends first, then who they are, what they did, and the site itself.

export type Tab = 'overview' | 'pages' | 'sources' | 'referrers' | 'utm' | 'search' | 'countries' | 'devices' | 'browsers' | 'funnels' | 'sales' | 'speed' | 'mentions' | 'outbound' | 'bots'
export type Section = 'overview' | 'pages' | 'sources' | 'places' | 'tech' | 'results' | 'sales' | 'speed' | 'mentions' | 'links'

export interface SectionDef {
  id: Section
  tabs: Tab[]
}

export const GROUPS: { id: 'traffic' | 'audience' | 'results' | 'site'; items: Section[] }[] = [
  { id: 'traffic', items: ['overview', 'pages', 'sources'] },
  { id: 'audience', items: ['places', 'tech'] },
  { id: 'results', items: ['results', 'sales'] },
  { id: 'site', items: ['speed', 'mentions', 'links'] },
]

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

export const sectionOf = (t: Tab): Section => (Object.keys(TABS) as Section[]).find((k) => TABS[k].includes(t)) ?? 'overview'

export const ALL_TABS: Tab[] = (Object.keys(TABS) as Section[]).flatMap((s) => TABS[s])
export const isTab = (v: string | undefined): v is Tab => !!v && (ALL_TABS as string[]).includes(v)

/** The dimensions a filter can take, and the report's own name for each. */
export const FILTER_DIMS = [
  { id: 'referrer', label: 'source', report: 'referrer' },
  { id: 'page', label: 'page', report: 'page' },
  { id: 'country', label: 'country', report: 'country' },
  { id: 'device', label: 'device', report: 'device' },
] as const
export type FilterDim = (typeof FILTER_DIMS)[number]['id']
