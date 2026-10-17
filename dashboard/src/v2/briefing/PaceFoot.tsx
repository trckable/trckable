// "→ ~9.4k this month" under the Visitors number, while the period runs to today: its own chunk, asked for once the page is quiet.
import { Suspense } from 'react'
import { lazyLoad } from '../../lib/lazyLoad'
import { isShared } from '../../lib/me'
import { readView } from '../../lib/url'
import { monthSoFar } from '../../features/extras/pace'
import { PaceHold } from '../../features/extras/PaceHold'

const PaceLine = lazyLoad(() => import('../../features/extras/PaceLine'))

export function PaceFoot({ site, today, live }: { site: string; today: string; live: boolean }) {
  if (!live || isShared()) return null
  const view = readView(new URLSearchParams(location.search))
  return (
    <Suspense fallback={monthSoFar(today) ? <PaceHold /> : null}>
      <PaceLine site={site} today={today} filters={view.filters} test={view.test} />
    </Suspense>
  )
}
