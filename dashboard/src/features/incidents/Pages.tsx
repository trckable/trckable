// The pages behind a site's address, one lazy chunk each (route.tsx opens them).
import { lazy, type ReactNode } from 'react'
import type { Site } from '../../lib/api'

const Incidents = lazy(() => import('./IncidentsPage'))
const Links = lazy(() => import('../links/LinksPage'))

export default function Pages({ site, header, links }: { site: Site; header: ReactNode; links: boolean }) {
  return links ? <Links site={site} header={header} /> : <Incidents site={site} header={header} />
}
