// Live's code, fetched once and shared: the switch starts the download on
// hover or focus, so by the click it is usually here and Live mounts straight
// away instead of flashing a placeholder while the chunk arrives.
import { lazy, Suspense, useState, type ComponentProps } from 'react'
import type LiveViewType from './LiveView'
import { Loading } from '../../components/loading/Loading'

type LiveComponent = typeof LiveViewType

let loading: Promise<LiveComponent> | null = null
let loaded: LiveComponent | null = null

export function preloadLive(): Promise<LiveComponent> {
  loading ??= import('./LiveView').then((m) => (loaded = m.default))
  // A failed download may be tried again on the next hover.
  loading.catch(() => (loading = null))
  return loading
}

const LazyLive = lazy(() => preloadLive().then((c) => ({ default: c })))

/** Live, without suspending when its code is already here. */
export function LiveSlot(props: ComponentProps<LiveComponent>) {
  // Chosen once per mount: swapping the component later would restart Live.
  const [Ready] = useState(() => loaded)
  if (Ready) return <Ready {...props} />
  return (
    // Live's own size while its code arrives, so nothing below jumps.
    <Suspense fallback={<div className="live-wait"><Loading /></div>}>
      <LazyLive {...props} />
    </Suspense>
  )
}
