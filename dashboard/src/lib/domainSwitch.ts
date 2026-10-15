// The domain switcher's logic: which hosts it offers, what each is called, and
// which one the address has picked. Pure, so the header only draws it.
import type { Filter, Row } from './api'

/** At most this many domains show as buttons; with more, the rest go behind "More". */
export const BUTTONS = 4
const SHOWN = 3

/** The site's own name without "www.": what a subdomain is measured against. */
export const rootOf = (domain: string) => domain.replace(/^www\./, '')

/** A domain as the control writes it: "docs" for docs.example.com, the site's name for the site itself. */
export function shortHost(host: string, domain: string): string {
  const root = rootOf(domain)
  if (host === root || host === 'www.' + root) return root
  return host.endsWith('.' + root) ? host.slice(0, -root.length - 1) : host
}

/** The domain the address filters to, when it is exactly one "is" filter; null for none or anything more involved. */
export function pickedHost(filters: Filter[]): string | null {
  const own = filters.filter((f) => f.dim === 'hostname')
  return own.length === 1 && own[0].op !== 'not' ? own[0].value : null
}

/** Whether the address filters by domain in any way. */
export const hostFiltered = (filters: Filter[]) => filters.some((f) => f.dim === 'hostname')

/** The list the control shows: what the report saw, or the one picked while a filter hides the rest. */
export function offered(seen: Row[] | null, filters: Filter[]): Row[] {
  if (seen && seen.length >= 2) return seen
  const one = pickedHost(filters)
  return one ? [{ value: one, visitors: 0 }] : []
}

/** The buttons and the overflow: the first three and the rest when there are more than four. */
export function split(rows: Row[]): { shown: Row[]; rest: Row[] } {
  return rows.length > BUTTONS ? { shown: rows.slice(0, SHOWN), rest: rows.slice(SHOWN) } : { shown: rows, rest: [] }
}
