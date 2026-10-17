// The one place the dashboard learns what each module puts on screen. The
// server's list (server/internal/modules) says which modules exist and which
// are on; this says where each one shows up: its cards, its Create entries,
// its filters and its tabs. Three kinds, as on the server: most have no
// switch and are simply there, revenue and search appear once connected, and
// only what changes the script is a choice. Nothing else in the UI checks a
// module by name.

/** Which modules a site has on, as the server sent them; null while loading. */
export type Mods = Partial<Record<string, boolean>> | null

export type CreateId = 'goal' | 'funnel' | 'note'

export interface EntryPoints {
  /** Entries in the Create menu. */
  create?: CreateId[]
  /** Cards, markers and panels on the dashboard. */
  cards?: string[]
  /** Filter dimensions only this module produces. */
  filters?: string[]
  /** Tabs inside cards (the map tab). */
  tabs?: string[]
}

// Every module the server knows is listed, even one with no entry points of
// its own (outbound, forms and consent change the script, not the page), so
// the test can check this list against the server's.
export const MODULES: Record<string, EntryPoints> = {
  goals: { create: ['goal'], cards: ['goals'], filters: ['goal'] },
  outbound: {},
  revenue: { cards: ['revenue'] },
  funnels: { create: ['funnel'], cards: ['funnel'] },
  notes: { create: ['note'], cards: ['notes'] },
  rhythm: { cards: ['rhythm'] },
  journeys: { cards: ['people', 'journey'] },
  map: { cards: ['money-map'], tabs: ['map'] },
  retention: { cards: ['retention'] },
  vitals: { cards: ['vitals'] },
  consent: {},
  crawlers: { cards: ['crawlers'] },
  forms: {},
  search: {},
  heatmaps: { cards: ['heatmaps'] },
}

/** No switch: always there, with an empty state where nothing was collected. */
export const ALWAYS: readonly string[] = ['funnels', 'notes', 'rhythm', 'journeys', 'map', 'retention', 'crawlers']

/** What changes the script or what it collects: the only modules with a switch. */
export const CHOICES: readonly string[] = ['goals', 'outbound', 'forms', 'vitals', 'heatmaps', 'consent']

/** On for a site that has not said otherwise (the server's default_on). */
export const DEFAULT_ON: Partial<Record<string, true>> = { goals: true, vitals: true }

/** Whether a module is on. While the list is loading, the defaults answer. */
export function isOn(mods: Mods, id: string): boolean {
  if (ALWAYS.includes(id)) return true
  if (mods === null) return DEFAULT_ON[id] === true
  return mods[id] === true
}

type Kind = keyof EntryPoints

/** The module an entry point belongs to, if any. */
export function ownerOf(kind: Kind, name: string): string | undefined {
  return Object.keys(MODULES).find((id) => entries(MODULES[id], kind).includes(name))
}

/** One kind of a module's entry points, empty when it has none. */
export const entries = (m: EntryPoints, kind: Kind): readonly string[] => m[kind] ?? []

/** Whether an entry point shows: one no module owns always does. */
export function shows(mods: Mods, kind: Kind, name: string): boolean {
  const id = ownerOf(kind, name)
  return id === undefined || isOn(mods, id)
}

const CREATE_ORDER: CreateId[] = ['goal', 'funnel', 'note']

/** The Create menu's entries whose modules are on, in menu order. */
export const createItems = (mods: Mods): CreateId[] => CREATE_ORDER.filter((c) => shows(mods, 'create', c))
