// Full's tabs on top of the two cards' own: the charts about where and when
// people came from, and the funnel, retention, people and the rest of what they
// did. A chunk of its own: Compact never loads any of it.
import { lazy, Suspense } from 'react'
import { Loading } from '../../components/loading/Loading'
import { shows } from '../../lib/modules'
import Highlights, { useInsights } from '../extras/Highlights'
import { extrasCopy } from '../extras/copy'
import type { ChartTab } from '../fullcharts/ChartPanels'
import { CardPair, whatTabs, whoTabs } from './base'
import type { CardsCtx } from './ctx'
import { deepCopy } from './deepCopy'
import type { CardTab } from './TabCard'

const ChartPanel = lazy(() => import('../fullcharts/ChartPanels'))
const Funnel = lazy(() => import('../../views/FullModules').then((m) => ({ default: m.Funnel })))
const SalePages = lazy(() => import('../extras/SalePages'))
const Buyers = lazy(() => import('../extras/Buyers'))
const Retention = lazy(() => import('./Retention'))
const People = lazy(() => import('./People'))
const Crawlers = lazy(() => import('../crawlers/Crawlers').then((m) => ({ default: m.Crawlers })))
const Vitals = lazy(() => import('../../views/Vitals').then((m) => ({ default: m.Vitals })))

const later = (node: React.ReactNode) => <Suspense fallback={<Loading height={180} />}>{node}</Suspense>

export default function FullCards({ c }: { c: CardsCtx }) {
  const tab = (id: string, label: string, render: () => React.ReactNode): CardTab => ({ id, label, render: () => later(render()) })
  const chart = (id: ChartTab, label: string) => tab(id, label, () => <ChartPanel tab={id} c={c} />)
  // What changed since the period before: a tab only while there is something to say.
  const found = useInsights(c.site.id, c.query, c.deep)
  const who = [...whoTabs(c), chart('over-time', deepCopy.tab.overTime)]
  if (found && found.length > 0) who.unshift(tab('highlights', extrasCopy.highlights.tab, () => <Highlights list={found} money={c.fmtMoney} onPick={c.addFilter} />))
  if (c.mods?.rhythm) who.push(chart('hours', deepCopy.tab.hours))
  if (c.money && c.mods?.map !== false && c.countryRevenue.length > 0) who.push(chart('revenue-map', deepCopy.tab.revenueMap))
  if (shows(c.mods, 'cards', 'crawlers')) who.push(tab('crawlers', deepCopy.tab.crawlers, () => <Crawlers site={c.site} query={c.query} />))

  const what = whatTabs(c)
  // After Sources that pay: the pages that sell, and the last sales with their way there.
  if (c.money) {
    const sells = tab('sells', extrasCopy.sells.tab, () => <SalePages site={c.site.id} query={c.query} money={c.fmtMoney} rows={c.rows} onPick={(page) => c.addFilter('page', page)} />)
    const buyers = shows(c.mods, 'cards', 'people') ? [tab('buyers', extrasCopy.buyers.tab, () => <Buyers site={c.site.id} query={c.query} money={c.fmtMoney} />)] : []
    what.splice(what.findIndex((t) => t.id === 'earners') + 1, 0, sells, ...buyers)
  }
  // What needs the modules' list waits for it.
  if (c.mods !== null) {
    if (shows(c.mods, 'cards', 'funnel')) what.push(tab('funnel', deepCopy.tab.funnel, () => <Funnel site={c.site} query={c.query} pages={c.dims('entry_page')} goals={c.goals} steps={c.steps} onSteps={c.onSteps} />))
    if (c.money) what.push(chart('visit-to-sale', deepCopy.tab.visitToSale), chart('to-convert', deepCopy.tab.toConvert))
    what.push(chart('flow', deepCopy.tab.flow))
    if (shows(c.mods, 'cards', 'retention')) what.push(tab('retention', deepCopy.tab.retention, () => <Retention site={c.site} query={c.query} />))
    if (shows(c.mods, 'cards', 'people')) what.push(tab('people', deepCopy.tab.people, () => <People site={c.site} onPick={c.onPickVisitor} />))
    if (shows(c.mods, 'cards', 'vitals')) what.push(tab('vitals', deepCopy.tab.vitals, () => <Vitals site={c.site} query={c.query} />))
  }
  return <CardPair c={c} who={who} what={what} />
}
