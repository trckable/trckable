// The main chart's hover card and its notes' flags, each its own chunk and
// fetched while the browser is idle: no one points at the chart before the
// page is up, and the notes come from the server after it (lib/lazyLoad).
// Revenue's plots are one more, fetched only by a chart that has revenue.
import { Suspense, type ComponentProps } from 'react'
import { lazyLoad, whenIdle } from '../lib/lazyLoad'

const Tip = lazyLoad(() => import('./TimeTip'))
const Markers = lazyLoad(() => import('../features/notes/NoteMarkers').then((m) => ({ default: m.NoteMarkers })))
const Plot = lazyLoad(() => import('./MoneyPlots').then((m) => ({ default: m.RevenuePlot })))
const Cols = lazyLoad(() => import('./MoneyPlots').then((m) => ({ default: m.MainColumns })))

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

/** Revenue is drawn by its own chunk, asked for once a chart has revenue. */
export const preloadMoney = () => Plot.preload()

export function RevenueLayer(p: ComponentProps<typeof Plot>) {
  return (
    <Suspense fallback={null}>
      <Plot {...p} />
    </Suspense>
  )
}

export function ColumnsLayer(p: ComponentProps<typeof Cols>) {
  return (
    <Suspense fallback={null}>
      <Cols {...p} />
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

/** Live pulse: each visit rises from the last point as a dot, a goal as a ring, a sale as a coin with its amount. */
export function Pulses({ pulses, n, x, y, vals }: { pulses?: { id: string; kind: string; label?: string }[]; n: number; x: (i: number) => number; y: (v: number) => number; vals: number[] }) {
  if (!n) return null
  return (
    <>
      {(pulses ?? []).map((pl) => (
        <span key={pl.id} className={'pulse-' + pl.kind} style={{ left: x(n - 1), top: y(vals[n - 1] ?? 0) }} aria-hidden="true">
          {pl.label}
        </span>
      ))}
    </>
  )
}
