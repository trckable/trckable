// Explore's seven sections, and the tables each one holds.
import { hasAnswers, hasMentions, isShared, sectionShown } from '../../lib/me'
import type { FilterDim, Section, Tab } from './types'

export type { Section, Tab } from './types'

/** The seven sections the menus list, in order. What changed is the Briefing: its own view, not one of them. */
const LISTED_SECTIONS: Section[] = ['overview', 'pages', 'sources', 'audience', 'goals', 'health', 'web']

const SECTIONS: Section[] = ['changed', ...LISTED_SECTIONS]

/** Goals & sales is four pages, each its own address: the tables on one page, the first of them the page's name. */
const GOAL_PAGES: Tab[][] = [
  ['goals'],
  ['funnels', 'toconvert', 'flow'],
  ['sales', 'vsale', 'earners', 'sells', 'revmap', 'payments', 'customers'],
  ['retention'],
]

/** The page of Goals & sales a table is on (its first table), or the table itself anywhere else. */
export const pageOf = (t: Tab): Tab => GOAL_PAGES.find((p) => p.includes(t))?.[0] ?? t

/** The tables that stand on the same page as this one: Goals & sales' page it is on, else the table alone. */
export const onPageWith = (t: Tab): Tab[] => GOAL_PAGES.find((p) => p.includes(t)) ?? [t]

const EVERY: Record<Section, Tab[]> = {
  changed: ['changed'],
  overview: ['overview', 'highlights', 'overtime', 'hours'],
  pages: ['pages', 'paths', 'entries', 'exits', 'groups'],
  sources: ['sources', 'utm'],
  audience: ['countries', 'regions', 'cities', 'timezones', 'languages', 'people', 'devices', 'browsers', 'networks', 'bversion', 'screens'],
  goals: ['goals', 'funnels', 'toconvert', 'flow', 'sales', 'vsale', 'earners', 'sells', 'revmap', 'payments', 'customers', 'retention'],
  health: ['speed'],
  web: ['ai', 'answers', 'outbound', 'mentions'],
}

/** What a shared link can read: the report alone (the public endpoint answers nothing else), so its tables and the payments the report carries. */
const SHARED: Tab[] = ['overview', 'pages', 'sources', 'utm', 'countries', 'devices', 'browsers', 'sales', 'earners']

/** The parts of a link a person switches on and off (lib/me) were named before the menu had seven: Places and Tech are Audience now, and the tables that moved to Goals & sales still answer for the section they came from. */
const LINK_KEY: Partial<Record<Tab, string>> = {
  ...Object.fromEntries(['countries', 'regions', 'cities', 'timezones', 'languages', 'people', 'revmap'].map((t) => [t, 'places'])),
  ...Object.fromEntries(['devices', 'browsers', 'networks', 'bversion', 'screens'].map((t) => [t, 'tech'])),
  earners: 'sources',
  sells: 'pages',
}

let networksSeen = false
/** Networks is offered once a visit of the period named its provider (an instance without the network database, and a site that drops region and city, never do). */
export const seeNetworks = (on: boolean) => {
  networksSeen = on
}

let noMoney = false
/** Whether the period's report carries payments. A shared link without them has nothing to show under Sales, and a viewer there can connect nothing. */
export const seeMoney = (on: boolean) => {
  noMoney = !on
}

/** The tables that read payments: on a shared link they are offered only once the report carries some. */
const PAYING: Tab[] = ['sales', 'payments', 'customers', 'earners']

/** Whether a table is offered here: all of them, but on a shared link only those the report can fill. */
export const offered = (t: Tab): boolean => (t !== 'mentions' || hasMentions()) && (t !== 'networks' || networksSeen) && (t !== 'answers' || hasAnswers()) && (!isShared() || (SHARED.includes(t) && !(noMoney && PAYING.includes(t)) && sectionShown(LINK_KEY[t] ?? sectionOf(t))))

/** A section's tables, as offered here. */
export const TABS = Object.fromEntries(SECTIONS.map((s) => [s, []])) as unknown as Record<Section, Tab[]>
for (const sec of SECTIONS) Object.defineProperty(TABS, sec, { get: () => EVERY[sec].filter(offered), enumerable: true })

/** The sections the menus list, those that have a table to offer. */
export const listedSections = (): Section[] => LISTED_SECTIONS.filter((sec) => TABS[sec].length > 0)

export const sectionOf = (t: Tab): Section => SECTIONS.find((s) => EVERY[s].includes(t)) ?? 'overview'

/** Tables the section list shows as their own entries, under their section (the section's own tab strip is unchanged). */
const LISTED: Partial<Record<Section, Tab[]>> = { goals: GOAL_PAGES.map((p) => p[0]), sources: ['sources', 'utm'] }
export const listedTabs = (s: Section): Tab[] => (LISTED[s] ?? []).filter(offered)

/** Where a section leads next: the sections that answer the question it raises. */
const RELATED: Record<Section, Section[]> = {
  changed: ['overview', 'pages', 'sources'],
  overview: ['pages', 'sources', 'audience'],
  pages: ['sources', 'goals', 'health'],
  sources: ['audience', 'goals', 'web'],
  audience: ['sources', 'health'],
  goals: ['pages', 'sources'],
  health: ['pages', 'audience'],
  web: ['sources', 'pages'],
}
export const relatedTo = (s: Section): Section[] => RELATED[s].filter((r) => TABS[r].length > 0)

export const ALL_TABS: Tab[] = SECTIONS.flatMap((s) => EVERY[s])

/** Whether an address's word for a table (?x=pages) is one. A link to Networks is followed before the report says whether any visit named a provider; the table then says it has none. */
export const isTab = (v: string | undefined): v is Tab => !!v && (ALL_TABS as string[]).includes(v) && (v === 'networks' || offered(v as Tab))

/** The tables that set two periods side by side; the rest read this period alone. */
export const compares = (t: Tab) => !HOSTED.includes(t) && !['speed', 'outbound', 'mentions', 'answers', 'sales', 'quality', 'paths', 'networks'].includes(t)

export const FILTER_DIMS: FilterDim[] = ['referrer', 'page', 'country', 'device', 'device_app']

/** What a table's rows filter by when a row is tapped. */
export const ROW_DIM: Partial<Record<Tab, FilterDim>> = { pages: 'page', sources: 'referrer', utm: 'referrer', countries: 'country', devices: 'device' }

/** The tabs whose numbers their own card reads (views/Hosted.tsx). */
export const HOSTED: Tab[] = ['goals', 'highlights', 'overtime', 'hours', 'revmap', 'earners', 'sells', 'people', 'payments', 'customers', 'retention', 'vsale', 'toconvert', 'flow', 'ai', 'answers']

/** Tables that were folded into another: an old address (?x=search) opens where they went. Search is Google's panel in Sources. */
const MOVED: Record<string, { tab: Tab; source?: string }> = { search: { tab: 'sources', source: 'google' }, referrers: { tab: 'sources' }, quality: { tab: 'sources' }, bots: { tab: 'ai' } }
export const movedTo = (v: string | undefined) => (v ? MOVED[v] : undefined)

/** The sections the menu had before the seven, and where each one went. */
const OLD_SECTIONS: Record<string, Section> = { search: 'sources', places: 'audience', tech: 'audience', results: 'goals', sales: 'goals', speed: 'health', mentions: 'web', links: 'web', ai: 'web', answers: 'web' }
/** A section's id as an older address, setting or link named it, or as it is now. */
export const sectionNamed = (v: string): Section | undefined => (SECTIONS as string[]).includes(v) ? (v as Section) : OLD_SECTIONS[v]
