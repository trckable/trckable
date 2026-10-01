// Small messages, bottom right: what happened, and what went wrong, in a few
// words. The first load carries only this door (toastBus.ts says things; the
// host that draws them is its own chunk, fetched when the first is told or the
// browser is idle).
import { Suspense, useEffect } from 'react'
import { lazyLoad, whenIdle } from '../lib/lazyLoad'
import { onWaiting } from './toastBus'

export { settle, toast } from './toastBus'

const Host = lazyLoad(() => import('./ToastHost'))
onWaiting(Host.preload)

export function Toasts() {
  useEffect(() => whenIdle(Host.preload), [])
  return (
    <Suspense fallback={null}>
      <Host />
    </Suspense>
  )
}
