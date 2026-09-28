// Full's Behaviour row: one card per module, each shown while its module is
// on, and the row gone when none is. Every card is its own chunk.
import { Suspense, lazy } from 'react'
import { Loading } from '../../components/loading/Loading'
import { shows, type Mods } from '../../lib/modules'
import type { FunnelStep, ReportQuery, Row, Site } from '../../lib/api'

const Funnel = lazy(() => import('../../views/FullModules').then((m) => ({ default: m.Funnel })))
const People = lazy(() => import('../../views/FullModules').then((m) => ({ default: m.People })))
const Crawlers = lazy(() => import('../crawlers/Crawlers').then((m) => ({ default: m.Crawlers })))
const Vitals = lazy(() => import('../../views/Vitals').then((m) => ({ default: m.Vitals })))
const Retention = lazy(() => import('../../views/Retention').then((m) => ({ default: m.Retention })))

const CARDS = ['funnel', 'people', 'crawlers', 'vitals', 'retention']

type Props = { site: Site; query: ReportQuery; mods: Mods; pages: Row[]; goals: Row[]; steps: FunnelStep[]; onSteps: (s: FunnelStep[]) => void; onPick: (visitor: string) => void }

export function Behaviour({ site, query, mods, pages, goals, steps, onSteps, onPick }: Props) {
  if (mods === null || !CARDS.some((c) => shows(mods, 'cards', c))) return null
  return (
    <Suspense fallback={<Loading height={180} />}>
      <section aria-label="Behaviour" className="grid2 rise" id="sec-behaviour" data-group>
        {shows(mods, 'cards', 'funnel') && <Funnel site={site} query={query} pages={pages} goals={goals} steps={steps} onSteps={onSteps} />}
        {shows(mods, 'cards', 'people') && <People site={site} onPick={onPick} />}
        {shows(mods, 'cards', 'crawlers') && <Crawlers site={site} query={query} />}
        {shows(mods, 'cards', 'vitals') && <Vitals site={site} query={query} />}
        {shows(mods, 'cards', 'retention') && <Retention site={site} query={query} />}
      </section>
    </Suspense>
  )
}
