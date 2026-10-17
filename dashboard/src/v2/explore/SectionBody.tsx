// The section the person is on: its loading shape while the numbers come, a plain line when they could not, or the
// section itself.
import { XError, XSkeleton } from '../ui/XBits'
import { copy } from './copy'
import type { XCtx } from './ctx'
import type { TabData } from './data/useExplore'
import type { Loaded } from './data/useLoad'
import { HOSTED } from './sections'
import type { HostedTab, Bot, Funnel, Mention, Overview as OverviewModel, Sales as SalesModel, Search as SearchModel, Speed as SpeedModel, Tab, Table } from './types'
import { Hosted } from './views/Hosted'
import { Overview } from './views/Overview'
import { Results } from './views/Results'
import { Sales } from './views/Sales'
import { Search } from './views/Search'
import { Bots, Mentions, Speed } from './views/Site'
import { Tables } from './views/Tables'

const isHosted = (t: Tab): t is HostedTab => HOSTED.includes(t)

const CARDS: Partial<Record<Tab, number>> = { overview: 4, search: 4, speed: 3 }

function Shown({ tab, x, d }: { tab: Tab; x: XCtx; d: TabData }) {
  switch (tab) {
    case 'overview':
      return <Overview x={x} d={d as OverviewModel} />
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

export function SectionBody({ tab, x, r }: { tab: Tab; x: XCtx; r: Loaded<TabData> }) {
  if (isHosted(tab)) return <Hosted tab={tab} x={x} />
  if (r.state === 'loading') return <XSkeleton cards={CARDS[tab] ?? 0} label={copy.loading} />
  if (r.state === 'error') return <XError title={copy.failed} hint={r.message} onRetry={r.retry} />
  return <Shown tab={tab} x={x} d={r.data} />
}
