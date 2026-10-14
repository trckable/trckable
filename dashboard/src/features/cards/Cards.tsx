// The two cards under the chart, in Compact and in Full. Full's extra tabs are
// a chunk of their own (FullCards); until it is here, the cards as Compact has them.
import { lazy, Suspense } from 'react'
import { Boundary } from '../../components/Boundary'
import { CardPair, whatTabs, whoTabs } from './base'
import type { CardsCtx } from './ctx'

const FullCards = lazy(() => import('./FullCards'))
const LinksCard = lazy(() => import('../links/LinksCard')) // what each tagged link brought: a chunk of its own
const MentionsCard = lazy(() => import('../mentions/MentionsCard')) // where the site is talked about: a chunk of its own

export function Cards({ c }: { c: CardsCtx }) {
  const basic = <CardPair c={c} who={whoTabs(c)} what={whatTabs(c)} />
  // A card that cannot be drawn says so; the chart above and the page stay.
  return (
    <>
      <Boundary reset={c.cur}>{c.deep ? <Suspense fallback={basic}><FullCards c={c} /></Suspense> : basic}</Boundary>
      {!c.shared && (
        <Boundary reset={c.site.id}>
          <Suspense fallback={null}>
            <LinksCard key={'l' + c.site.id} site={c.site} from={c.query.from} to={c.query.to} onPick={c.addFilter} />
            <MentionsCard key={c.site.id} site={c.site} />
          </Suspense>
        </Boundary>
      )}
    </>
  )
}
