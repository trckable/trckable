// The pages that hang off a site's address: /{domain}/incidents and /{domain}/mentions and /{domain}/links.
import { lazy, Suspense, type ReactNode } from 'react'
import { Loading } from '../components/loading/Loading'
import type { Site } from '../lib/api'
import { siteForSegment } from '../lib/siteRoute'

export type Sub = 'incidents' | 'mentions' | 'links'

const Pages = lazy(() => import('./subpages')) // both pages are chunks of their own, fetched when one is opened

/** What an address names: one of the sites, and which of its pages (none: the dashboard). */
export function routeOf(sites: Site[], path: string): { site: Site | null; sub: Sub | null } {
  const seg = path.slice(1)
  const at = /^(.+)\/(incidents|mentions|links)$/.exec(seg)
  const site = at && siteForSegment(sites, decodeURIComponent(at[1]))
  return site ? { site, sub: at[2] as Sub } : { site: siteForSegment(sites, seg), sub: null }
}

export const SubRoute = (p: { sub: Sub; site: Site; header: ReactNode }) => (
  <Suspense fallback={<Loading height={320} />}>
    <Pages {...p} />
  </Suspense>
)
