// What the page knows about the person's account when it starts: their role
// there and, for someone in several accounts, the account this tab works in
// and where a link to a site takes them (lib/accountMove.ts, in the switcher's chunk, fetched only then).
import type { Me, Site } from './api'
import { setRole } from './me'

export async function inAccount(me: Me, sites: Site[]): Promise<{ sites: Site[] }> {
  setRole(me.role)
  return (me.accounts?.length ?? 0) > 1 && !me.must_change ? (await import('../features/sites/SiteMenu')).settle(me, sites) : { sites }
}
