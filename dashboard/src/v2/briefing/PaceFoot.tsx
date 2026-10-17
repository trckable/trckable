// "→ ~9.4k this month" under the Visitors number, only while the period is this month so far (a projection of the month says nothing of a day, a week or a rolling 30 days): its own chunk, asked for once the page is quiet.
import { Suspense } from 'react'
import { isMonthSoFar } from '../../features/extras/pace'
import { lazyLoad } from '../../lib/lazyLoad'
import { isShared } from '../../lib/me'
import { readView } from '../../lib/url'

const PaceLine = lazyLoad(() => import('../../features/extras/PaceLine'))

export function PaceFoot({ site, today, range }: { site: string; today: string; range: { from: string; to: string } }) {
  if (!isMonthSoFar(range, today) || isShared()) return null
  const view = readView(new URLSearchParams(location.search))
  return (
    <Suspense fallback={null}>
      <PaceLine site={site} today={today} filters={view.filters} test={view.test} />
    </Suspense>
  )
}
