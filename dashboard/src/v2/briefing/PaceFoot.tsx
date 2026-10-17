// "→ ~9.4k this month" under the Visitors number, while the period runs to today: its own chunk, asked for once the page is quiet.
import { Suspense } from 'react'
import { lazyLoad } from '../../lib/lazyLoad'
import { isShared } from '../../lib/me'
import { readView } from '../../lib/url'

const PaceLine = lazyLoad(() => import('../../features/extras/PaceLine'))

export function PaceFoot({ site, today, live }: { site: string; today: string; live: boolean }) {
  if (!live || isShared()) return null
  const view = readView(new URLSearchParams(location.search))
  return (
    <Suspense fallback={null}>
      <PaceLine site={site} today={today} filters={view.filters} test={view.test} />
    </Suspense>
  )
}
