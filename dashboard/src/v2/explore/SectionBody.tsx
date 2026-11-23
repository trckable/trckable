// The section the person is on: its loading shape while the numbers come, a plain line when they could not, or the
// section itself.
import { useEffect, useRef, useState } from 'react'
import { XError, XSkeleton } from '../ui/XBits'
import { copy } from './copy'
import type { XCtx } from './ctx'
import type { TabData } from './data/useExplore'
import type { Loaded } from './data/useLoad'
import type { Report } from '../../lib/api'
import { Changed } from './views/Changed'
import { HOSTED } from './sections'
import type { Briefing, Networks as NetworksModel, Paths as PathsModel, HostedTab, Funnel, Mention, Overview as OverviewModel, Sales as SalesModel, Speed as SpeedModel, Tab, Table } from './types'
import { Hosted } from './views/Hosted'
import { Overview } from './views/Overview'
import { Networks } from './views/Networks'
import { PathsView } from './views/Paths'
import { Results } from './views/Results'
import { Sales } from './views/Sales'
import { SourcesView } from './views/Sources'
import { Mentions, Speed } from './views/Site'
import { Tables } from './views/Tables'

const isHosted = (t: Tab): t is HostedTab => HOSTED.includes(t)

const CARDS: Partial<Record<Tab, number>> = { changed: 4, overview: 4, speed: 3 }

function Shown({ tab, x, d }: { tab: Tab; x: XCtx; d: TabData }) {
  switch (tab) {
    case 'changed':
      return <Changed x={x} d={d as Briefing} />
    case 'overview':
      return <Overview x={x} d={d as OverviewModel & { report: Report }} />
    case 'paths':
      return <PathsView x={x} d={d as PathsModel} />
    case 'networks':
      return <Networks x={x} d={d as NetworksModel} />
    case 'sources':
      return <SourcesView x={x} d={d as Table} />
    case 'funnels':
      return <Results x={x} d={d as Funnel} />
    case 'sales':
      return <Sales x={x} d={d as SalesModel} />
    case 'speed':
      return <Speed x={x} d={d as SpeedModel} />
    case 'mentions':
      return <Mentions x={x} d={d as Mention[]} />
    default:
      return <Tables tab={tab} x={x} d={d as Table} />
  }
}

export function SectionBody({ tab, x, r, still }: { tab: Tab; x: XCtx; r: Loaded<TabData>; still?: boolean }) {
  // Numbers of an earlier period or filter never stay on screen while the new ones are read: only the height they had is held, so the page does not jump, and the loading shape fills it once the wait is felt (explore.css .xhold).
  const box = useRef<HTMLDivElement>(null)
  const [held, setHeld] = useState<{ tab: Tab; h: number } | null>(null)
  const shown = r.state === 'ok' && !isHosted(tab)
  useEffect(() => {
    const el = box.current
    if (!shown || !el || typeof ResizeObserver === 'undefined') return
    const note = () => setHeld((o) => (o?.tab === tab && o.h === el.offsetHeight ? o : { tab, h: el.offsetHeight }))
    note()
    const ro = new ResizeObserver(note)
    ro.observe(el)
    return () => ro.disconnect()
  }, [shown, tab])
  useEffect(() => {
    if (!still && scrollY > 0) scrollTo({ top: 0 })
  }, [tab, still])
  if (isHosted(tab)) return <div key={tab} className="xfade"><Hosted tab={tab} x={x} /></div>
  if (r.state === 'loading') return <div className="xhold" style={{ minHeight: held?.tab === tab ? held.h : undefined }} aria-busy="true"><XSkeleton cards={CARDS[tab] ?? 0} label={copy.loading} /></div>
  if (r.state === 'error') return <XError title={copy.failed} hint={r.message} onRetry={r.retry} />
  return <div key={tab} ref={box} className="xfade"><Shown tab={tab} x={x} d={r.data} /></div>
}
