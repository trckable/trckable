// The first load carries only this door: the host (its own chunk) is fetched
// only while there is a hint left for this person to meet.
import { lazy, Suspense, useState } from 'react'
import { isViewer } from '../../lib/me'
import { allDone } from './rules'
import { kept } from './store'

const Host = lazy(() => import('./HintHost'))

export function Hints() {
  const [wanted] = useState(() => {
    const k = kept()
    return !k.off && !allDone(k.seen, isViewer())
  })
  if (!wanted) return null
  return (
    <Suspense fallback={null}>
      <Host />
    </Suspense>
  )
}
