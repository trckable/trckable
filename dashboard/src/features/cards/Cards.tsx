// The two cards under the chart, in Compact and in Full. Full's extra tabs are
// a chunk of their own (FullCards); until it is here, the cards as Compact has them.
import { lazy, Suspense } from 'react'
import { Boundary } from '../../components/Boundary'
import { CardPair, whatTabs, whoTabs } from './base'
import type { CardsCtx } from './ctx'

const FullCards = lazy(() => import('./FullCards'))

export function Cards({ c }: { c: CardsCtx }) {
  const basic = <CardPair c={c} who={whoTabs(c)} what={whatTabs(c)} />
  // A card that cannot be drawn says so; the chart above and the page stay.
  return <Boundary reset={c.cur}>{c.deep ? <Suspense fallback={basic}><FullCards c={c} /></Suspense> : basic}</Boundary>
}
