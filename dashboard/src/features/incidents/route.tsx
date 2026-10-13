// Where a site's incident history lives: /{domain}/incidents, with the
// period in the address like the dashboard's (?period, ?from, ?to).
import { Suspense, type ReactNode } from 'react'
import { Loading } from '../../components/loading/Loading'
import { lazyLoad } from '../../lib/lazyLoad'
import { siteForSegment } from '../../lib/siteRoute'
import type { Site } from '../../lib/api'

const Page = lazyLoad(() => import('./IncidentsPage'))

/** The page itself, its own chunk: only asked for when someone opens it. */
export function IncidentsRoute({ site, header }: { site: Site; header: ReactNode }) {
  return (
    <Suspense fallback={<Loading height={320} />}>
      <Page site={site} header={header} />
    </Suspense>
  )
}

const SUFFIX = '/incidents'

/** The address of a site's history; `keep` carries the period the dashboard shows over to it. */
export function incidentsPath(domain: string, keep = false): string {
  const q = new URLSearchParams()
  if (keep) {
    const here = new URLSearchParams(location.search)
    for (const k of ['period', 'from', 'to']) if (here.get(k)) q.set(k, here.get(k) ?? '')
  }
  const s = q.toString()
  return '/' + encodeURIComponent(domain) + SUFFIX + (s ? '?' + s : '')
}

/** What an address names: one of the sites, and whether it is the history page of it. */
export function routeOf(sites: Site[], path: string): { site: Site | null; incidents: boolean } {
  const seg = path.slice(1)
  if (seg.endsWith(SUFFIX)) {
    const site = siteForSegment(sites, decodeURIComponent(seg.slice(0, -SUFFIX.length)))
    if (site) return { site, incidents: true }
  }
  return { site: siteForSegment(sites, seg), incidents: false }
}
