// Explore as the second screen: the same content the panel had, standing in the page under the shared header.
import { lazy, Suspense, useEffect, useState } from 'react'
import './explore.css'
import { XSkeleton } from '../ui/XBits'
import { QUERY } from '../../kit/breakpoints'
import { copy } from './copy'
import { askOf } from './open'
import { pageDetails } from './pageStore'
import { ChangedChart, OverviewChart } from './views/chartChunk'
import type { ContentProps } from './PanelContent'

const PanelContent = lazy(() => import('./PanelContent'))
const PageDetails = lazy(() => import('./PageDetails'))
export const preloadExplore = () => void import('./PanelContent')

export function ExplorePage(p: Omit<ContentProps, 'ask' | 'full'>) {
  const [wide, setWide] = useState(() => matchMedia(QUERY.rail).matches)
  useEffect(() => {
    const m = matchMedia(QUERY.rail)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  // The What changed chart's code comes down beside the page's own, not after the cards.
  useEffect(() => {
    ChangedChart.preload()
    OverviewChart.preload()
  }, [])
  const { xp, xf, filters } = p.view
  const details = pageDetails.use()
  const ask = askOf({ xp: xp ?? 'changed', xf, filters }) ?? { tab: 'changed' as const, filters: [] }
  return (
    <>
    <section className={`xp xpage on${wide ? ' full' : ''}`} id="xp" aria-label={copy.title}>
      <Suspense fallback={<XSkeleton cards={2} label={copy.loading} />}>
        <PanelContent {...p} ask={ask} full={wide} />
      </Suspense>
    </section>
    {details !== null && (
      <Suspense fallback={null}>
        <PageDetails site={p.site} range={p.range} view={p.view} />
      </Suspense>
    )}
    </>
  )
}
