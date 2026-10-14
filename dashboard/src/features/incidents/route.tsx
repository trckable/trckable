// Where a site's incident history lives: /{domain}/incidents, with the
// period in the address like the dashboard's (?period, ?from, ?to).
import { Suspense, type ReactNode } from 'react'
import { Loading } from '../../components/loading/Loading'
import { lazyLoad } from '../../lib/lazyLoad'
import { siteForSegment } from '../../lib/siteRoute'
import type { Site } from '../../lib/api'
import { sitePagePath } from '../../lib/sitePath'

const Page = lazyLoad(() => import('./Pages'))

/** The page itself (the history, or Your links), its own chunk: only asked for when someone opens it. */
export function IncidentsRoute({ site, header, links }: { site: Site; header: ReactNode; links: boolean }) {
  return (
    <Suspense fallback={<Loading height={320} />}>
      <Page site={site} header={header} links={links} />
    </Suspense>
  )
}

const SUFFIX = '/incidents'

/** The address of a site's history; `keep` carries the period the dashboard shows over to it. */
export const incidentsPath = (domain: string, keep = false): string => sitePagePath(domain, SUFFIX, keep)

/** What an address names: one of the sites, and whether it is the history page of it or its Your links page. */
export function routeOf(sites: Site[], path: string): { site: Site | null; incidents: boolean; links: boolean } {
  const seg = path.slice(1)
  const at = /^(.+)\/(incidents|links)$/.exec(seg)
  const site = at && siteForSegment(sites, decodeURIComponent(at[1]))
  return site ? { site, incidents: at[2] === 'incidents', links: at[2] === 'links' } : { site: siteForSegment(sites, seg), incidents: false, links: false }
}
