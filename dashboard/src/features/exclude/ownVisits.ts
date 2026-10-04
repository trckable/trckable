// Leaving your own browser out of the counts. The tracker keeps that choice on
// the site's own origin (?trckable=ignore, undone by ?trckable=track), and the
// dashboard is somewhere else, so it can only open the site and ask. What it
// knows about the answer: the real flag when the dashboard is served from the
// site itself, otherwise only what was last chosen here. Pure over a storage,
// so it is tested: ownVisits.test.ts.
import type { Site } from '../../lib/api'

export type Choice = 'ignore' | 'track'

/** The address that makes the tracker leave a browser out, or count it again. */
export const flagLink = (domain: string, what: Choice) => `https://${domain}/?trckable=${what}`

const remembered = (site: string) => `trckable:own:${site}`

/** Whether the dashboard is open on the site's own address, where the tracker's flag is readable. */
export const onSiteItself = (domain: string, host: string) => {
  const h = host.toLowerCase().replace(/^www\./, '')
  return h === domain.toLowerCase().replace(/^www\./, '')
}

/** What is known about this browser: 'excluded', 'counted', or null when it cannot be told. */
export function stateOf(site: Pick<Site, 'id' | 'domain'>, host?: string, store?: Pick<Storage, 'getItem'>): 'excluded' | 'counted' | null {
  try {
    const s = store ?? localStorage
    if (onSiteItself(site.domain, host ?? location.hostname)) return s.getItem('trckable_ignore') ? 'excluded' : 'counted'
    const last = s.getItem(remembered(site.id))
    if (last === 'ignore') return 'excluded'
    return last === 'track' ? 'counted' : null
  } catch {
    return null
  }
}

/** What the next press does: count the browser again if it is left out, else leave it out. */
export const nextChoice = (state: ReturnType<typeof stateOf>): Choice => (state === 'excluded' ? 'track' : 'ignore')

/** Opens the site in a new tab with the flag, and remembers what was asked. */
export function choose(site: Pick<Site, 'id' | 'domain'>, what: Choice, store?: Pick<Storage, 'setItem'>) {
  try {
    ;(store ?? localStorage).setItem(remembered(site.id), what)
  } catch {
    /* a browser that will not store it just forgets */
  }
  window.open(flagLink(site.domain, what), '_blank', 'noopener')
}

/** Cookieless mode keeps nothing in the browser, so there is nothing to leave out by. */
export const canLeaveOut = (site: Pick<Site, 'cookieless'>) => !site.cookieless
