// The section the person is on: its loading shape while the numbers come, a plain line when they could not, or the
// section itself.
import { useEffect, useState } from 'react'
import { XError, XSkeleton } from '../ui/XBits'
import { copy } from './copy'
import type { XCtx } from './ctx'
import type { TabData } from './data/useExplore'
import type { Loaded } from './data/useLoad'
import type { Report } from '../../lib/api'
import { Changed } from './views/Changed'
import { HOSTED } from './sections'
import type { Networks as NetworksModel, Paths as PathsModel, Quality as QualityModel, HostedTab, Bot, Funnel, Mention, Overview as OverviewModel, Sales as SalesModel, Search as SearchModel, Speed as SpeedModel, Tab, Table } from './types'
import { Hosted } from './views/Hosted'
import { Overview } from './views/Overview'
import { Networks } from './views/Networks'
import { PathsView } from './views/Paths'
import { Quality } from './views/Quality'
import { Results } from './views/Results'
import { Sales } from './views/Sales'
import { Search } from './views/Search'
import { Bots, Mentions, Speed } from './views/Site'
import { Tables } from './views/Tables'

const isHosted = (t: Tab): t is HostedTab => HOSTED.includes(t)

const CARDS: Partial<Record<Tab, number>> = { changed: 4, overview: 4, search: 4, speed: 3 }

function Shown({ tab, x, d }: { tab: Tab; x: XCtx; d: TabData }) {
  switch (tab) {
    case 'changed':
      return <Changed x={x} d={d as OverviewModel & { report: Report }} />
    case 'overview':
      return <Overview x={x} d={d as OverviewModel} />
    case 'paths':
      return <PathsView x={x} d={d as PathsModel} />
    case 'quality':
      return <Quality d={d as QualityModel} />
    case 'networks':
      return <Networks x={x} d={d as NetworksModel} />
    case 'search':
      return <Search x={x} d={d as SearchModel} />
    case 'funnels':
      return <Results x={x} d={d as Funnel} />
    case 'sales':
      return <Sales x={x} d={d as SalesModel} />
    case 'speed':
      return <Speed x={x} d={d as SpeedModel} />
    case 'mentions':
      return <Mentions x={x} d={d as Mention[]} />
    case 'bots':
      return <Bots x={x} d={d as Bot[]} />
    default:
      return <Tables tab={tab} x={x} d={d as Table} />
  }
}

export function SectionBody({ tab, x, r, still }: { tab: Tab; x: XCtx; r: Loaded<TabData>; still?: boolean }) {
  // The last numbers of this table stay, dimmed, while a new period or filter is read: the page does not jump. Another table starts from its loading shape.
  const [kept, setKept] = useState<{ tab: Tab; data: TabData } | null>(null)
  if (r.state === 'ok' && (kept?.tab !== tab || kept.data !== r.data)) setKept({ tab, data: r.data })
  const stale = r.state === 'loading' && kept?.tab === tab ? kept.data : null
  useEffect(() => {
    if (!still && scrollY > 0) scrollTo({ top: 0 })
  }, [tab, still])
  if (isHosted(tab)) return <div key={tab} className="xfade"><Hosted tab={tab} x={x} /></div>
  if (stale) return <div key={tab} className="xstale" aria-busy="true"><Shown tab={tab} x={x} d={stale} /></div>
  if (r.state === 'loading') return <XSkeleton cards={CARDS[tab] ?? 0} label={copy.loading} />
  if (r.state === 'error') return <XError title={copy.failed} hint={r.message} onRetry={r.retry} />
  return <div key={tab} className="xfade"><Shown tab={tab} x={x} d={r.data} /></div>
}
