// The main chart's hover card and its notes' flags, each its own chunk and
// fetched while the browser is idle: no one points at the chart before the
// page is up, and the notes come from the server after it (lib/lazyLoad).
// Revenue's plots are one more, fetched only by a chart that has revenue.
import { Suspense, type ComponentProps } from 'react'
import { lazyLoad, whenIdle } from '../lib/lazyLoad'
import { SPLIT_H } from './moneyPlot'
import { CHART_H } from './plot'

const Tip = lazyLoad(() => import('./TimeTip'))
const Markers = lazyLoad(() => import('../features/notes/NoteMarkers').then((m) => ({ default: m.NoteMarkers })))
const Plot = lazyLoad(() => import('./MoneyPlots').then((m) => ({ default: m.RevenuePlot })))
const Model = lazyLoad(() => import('./models/ModelChart'))
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

/** The try-out's chart: a chunk of its own, asked for as soon as a model is. Until it is here, the chart's box. */
export function ModelChart(p: ComponentProps<typeof Model>) {
  return (
    <Suspense fallback={<div style={{ height: (p.height ?? CHART_H) + (p.revenue ? SPLIT_H : 0) }} />}>
      <Model {...p} />
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
