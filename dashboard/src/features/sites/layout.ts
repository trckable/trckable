// How the site switcher is arranged: pinned sites on top, then each named
// group, then the rest. Pure functions over the saved layout, so the
// switcher, All sites and the tests all read one order.
import type { Site, SiteLayout } from '../../lib/api'

export const EMPTY: SiteLayout = { order: [], pinned: [], groups: [] }

/** Where a site sits: pinned, in a group (by name), or in the plain list. */
export type Place = { kind: 'pinned' } | { kind: 'group'; name: string } | { kind: 'rest' }

export interface Section {
  place: Place
  sites: Site[]
}

/** The key a section is known by (collapsed groups are remembered by it). */
export const placeKey = (p: Place) => (p.kind === 'group' ? 'g:' + p.name : p.kind)

export function placeOf(id: string, l: SiteLayout): Place {
  if (l.pinned.includes(id)) return { kind: 'pinned' }
  const g = l.groups.find((x) => x.sites.includes(id))
  return g ? { kind: 'group', name: g.name } : { kind: 'rest' }
}

/** Sites in the layout's order; ones it does not know yet follow, oldest first. */
export function inOrder(sites: Site[], l: SiteLayout): Site[] {
  const at = new Map(l.order.map((id, i) => [id, i]))
  const rank = (s: Site, i: number) => at.get(s.id) ?? l.order.length + i
  return sites.map((s, i) => ({ s, r: rank(s, i) })).sort((a, b) => a.r - b.r).map((x) => x.s)
}

/** The switcher's sections, top to bottom. Empty groups stay (a new group
 *  is empty until something is moved in); empty pinned and rest do not. */
export function sectionsOf(sites: Site[], l: SiteLayout): Section[] {
  const ordered = inOrder(sites, l)
  const pinned = ordered.filter((s) => l.pinned.includes(s.id))
  const groups: Section[] = l.groups.map((g) => ({
    place: { kind: 'group', name: g.name },
    sites: ordered.filter((s) => !l.pinned.includes(s.id) && g.sites.includes(s.id)),
  }))
  const rest = ordered.filter((s) => placeOf(s.id, l).kind === 'rest')
  const out: Section[] = []
  if (pinned.length) out.push({ place: { kind: 'pinned' }, sites: pinned })
  out.push(...groups)
  if (rest.length) out.push({ place: { kind: 'rest' }, sites: rest })
  return out
}

/** Every site, top to bottom, as the switcher shows them: All sites uses it. */
export const flat = (sites: Site[], l: SiteLayout) => sectionsOf(sites, l).flatMap((x) => x.sites)

/** A layout that writes down the order on screen, so a move is relative to it. */
function settled(sites: Site[], l: SiteLayout): SiteLayout {
  return { ...l, order: flat(sites, l).map((s) => s.id) }
}

/** Put a site into a place: just before `before` when it was dropped on a
 *  site there, else last among the sites already there. */
export function moveTo(sites: Site[], l: SiteLayout, id: string, to: Place, before?: string): SiteLayout {
  const base = settled(sites, l)
  const pinned = base.pinned.filter((x) => x !== id)
  const groups = base.groups.map((g) => ({ ...g, sites: g.sites.filter((x) => x !== id) }))
  if (to.kind === 'pinned') pinned.push(id)
  if (to.kind === 'group') groups.find((g) => g.name === to.name)?.sites.push(id)
  const next = { order: base.order.filter((x) => x !== id), pinned, groups }
  const peers = next.order.filter((x) => placeKey(placeOf(x, next)) === placeKey(to))
  let at = before ? next.order.indexOf(before) : -1
  if (at < 0) at = peers.length ? next.order.indexOf(peers[peers.length - 1]) + 1 : next.order.length
  next.order.splice(at, 0, id)
  return next
}

/** One step up or down inside its own section; nothing at either end. */
export function step(sites: Site[], l: SiteLayout, id: string, dir: -1 | 1): SiteLayout {
  const sec = sectionsOf(sites, l).find((x) => x.sites.some((s) => s.id === id))
  if (!sec) return l
  const i = sec.sites.findIndex((s) => s.id === id)
  const j = i + dir
  if (j < 0 || j >= sec.sites.length) return l
  const base = settled(sites, l)
  const order = [...base.order]
  const a = order.indexOf(id)
  const b = order.indexOf(sec.sites[j].id)
  order[a] = sec.sites[j].id
  order[b] = id
  return { ...base, order }
}

export const pin = (sites: Site[], l: SiteLayout, id: string) => moveTo(sites, l, id, { kind: 'pinned' })
export const unpin = (sites: Site[], l: SiteLayout, id: string) => moveTo(sites, l, id, { kind: 'rest' })

export function addGroup(l: SiteLayout, name: string): SiteLayout {
  const n = name.trim()
  if (!n || l.groups.some((g) => g.name.toLowerCase() === n.toLowerCase())) return l
  return { ...l, groups: [...l.groups, { name: n, sites: [] }] }
}

export function renameGroup(l: SiteLayout, from: string, to: string): SiteLayout {
  const n = to.trim()
  if (!n || l.groups.some((g) => g.name !== from && g.name.toLowerCase() === n.toLowerCase())) return l
  return { ...l, groups: l.groups.map((g) => (g.name === from ? { ...g, name: n } : g)) }
}

/** Removing a group keeps its sites: they return to the plain list. */
export const removeGroup = (l: SiteLayout, name: string): SiteLayout => ({ ...l, groups: l.groups.filter((g) => g.name !== name) })

/** A group one place up or down among the groups. */
export function stepGroup(l: SiteLayout, name: string, dir: -1 | 1): SiteLayout {
  const i = l.groups.findIndex((g) => g.name === name)
  const j = i + dir
  if (i < 0 || j < 0 || j >= l.groups.length) return l
  const groups = [...l.groups]
  groups[i] = l.groups[j]
  groups[j] = l.groups[i]
  return { ...l, groups }
}
