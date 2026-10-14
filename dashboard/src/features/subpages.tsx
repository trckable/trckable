// The pages behind a site's address, each a chunk of its own (subpage.tsx opens them).
import { lazy, type ReactNode } from 'react'
import type { Site } from '../lib/api'
import type { Sub } from './subpage'

const Incidents = lazy(() => import('./incidents/IncidentsPage'))
const Links = lazy(() => import('./links/LinksPage'))
const Mentions = lazy(() => import('./mentions/MentionsPage'))

export default function Subpages({ sub, site, header }: { sub: Sub; site: Site; header: ReactNode }) {
  if (sub === 'links') return <Links site={site} header={header} />
  return sub === 'mentions' ? <Mentions site={site} header={header} /> : <Incidents site={site} header={header} />
}
