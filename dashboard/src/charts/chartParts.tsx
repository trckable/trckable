// The main chart's hover card and its notes' flags, each its own chunk and
// fetched while the browser is idle: no one points at the chart before the
// page is up, and the notes come from the server after it (lib/lazyLoad).
import { Suspense, type ComponentProps } from 'react'
import { lazyLoad, whenIdle } from '../lib/lazyLoad'

const Tip = lazyLoad(() => import('./TimeTip'))
const Markers = lazyLoad(() => import('../features/notes/NoteMarkers').then((m) => ({ default: m.NoteMarkers })))

whenIdle(() => {
  Tip.preload()
  Markers.preload()
})

export function TimeTip(p: ComponentProps<typeof Tip>) {
  return (
    <Suspense fallback={null}>
      <Tip {...p} />
    </Suspense>
  )
}

/** Nothing to fetch or draw on a chart without notes. */
export function NoteMarkers(p: ComponentProps<typeof Markers>) {
  if (!p.markers.length) return null
  return (
    <Suspense fallback={null}>
      <Markers {...p} />
    </Suspense>
  )
}
