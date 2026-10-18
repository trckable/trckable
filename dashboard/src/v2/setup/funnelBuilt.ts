// Tells the server once per site, per page load, that an owner has a funnel of their own steps on screen: the
// setup ring's "A funnel" step is then done. A suggested funnel (no steps in the address) is not one they built.
import { more } from '../../lib/apiMore'
import { can } from '../../lib/permissions'

const told = new Set<string>()

export function funnelBuilt(site: string, steps: number): void {
  if (steps < 2 || !can('funnel.create') || told.has(site)) return
  told.add(site)
  more.setupFunnel(site).catch(() => told.delete(site))
}
