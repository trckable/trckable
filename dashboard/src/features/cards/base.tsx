// The tabs both modes have: card 1, who came (sources, pages, locations,
// devices) and card 2, what they did (goals, what paid).
import { lazy, Suspense } from 'react'
import { Loading } from '../../components/loading/Loading'
import { lazyLoad, whenIdle } from '../../lib/lazyLoad'
import { isOn, shows } from '../../lib/modules'
import { PagesPanel, SourcesPanel } from './Breakdowns'
import { aiTab } from '../aisearch/tabCopy'
import { cardCopy } from './copy'
import type { CardsCtx } from './ctx'
import { GoalsPanel } from './Money'
import { TabCard, type CardTab } from './TabCard'

const Earners = lazyLoad(() => import('./Earners'))
whenIdle(Earners.preload)
// Where from in the world and on what: not the tab a card opens on, so a chunk of their own, fetched when the browser is idle.
const Locations = lazyLoad(() => import('./PlacePanels').then((m) => ({ default: m.LocationsPanel })))
const Devices = lazyLoad(() => import('./PlacePanels').then((m) => ({ default: m.DevicesPanel })))
whenIdle(Locations.preload)
const later = (node: React.ReactNode) => <Suspense fallback={<Loading height={164} />}>{node}</Suspense>
const FullButton = lazy(() => import('./FullButton'))
// Google, the AI assistants and the AI crawlers: one chunk, fetched when its tab is opened.
const AiSearch = lazyLoad(() => import('../aisearch/AiSearch'))

/** AI & Search is in Full, and in Compact once Search Console is on; a share link cannot reach it. */
export const showsAiSearch = (c: CardsCtx) => !c.shared && (c.full || isOn(c.mods, 'search'))

export function whoTabs(c: CardsCtx): CardTab[] {
  const tabs: CardTab[] = [
    { id: 'sources', label: cardCopy.sources, render: () => <SourcesPanel c={c} /> },
    { id: 'pages', label: cardCopy.pages, render: () => <PagesPanel c={c} /> },
    { id: 'locations', label: cardCopy.locations, render: () => later(<Locations c={c} />) },
    { id: 'devices', label: cardCopy.devices, render: () => later(<Devices c={c} />) },
  ]
  if (showsAiSearch(c)) tabs.push({ id: 'ai-search', label: aiTab.label, render: () => later(<AiSearch c={c} />) })
  return tabs
}

export function whatTabs(c: CardsCtx): CardTab[] {
  const tabs: CardTab[] = []
  if (shows(c.mods, 'cards', 'goals')) tabs.push({ id: 'goals', label: cardCopy.goals, render: () => <GoalsPanel c={c} /> })
  if (c.money) tabs.push({ id: 'earners', label: cardCopy.earners, render: () => <Suspense fallback={<Loading height={164} />}><Earners c={c} /></Suspense> })
  return tabs
}

/** The card pair, from the tabs each card has. */
export function CardPair({ c, who, what }: { c: CardsCtx; who: CardTab[]; what: CardTab[] }) {
  return (
    <section aria-label={cardCopy.who + ' / ' + cardCopy.what} className="cards2" id="cards">
      <TabCard key={c.site.id + 'who'} card="who" site={c.site.id} label={cardCopy.who} tabs={who} more={!c.full && !c.shared ? <Suspense fallback={null}><FullButton onFull={c.onFull} /></Suspense> : undefined} />
      {what.length > 0 && <TabCard key={c.site.id + 'what'} card="what" site={c.site.id} label={cardCopy.what} tabs={what} want={c.steps.length > 0 ? 'funnel' : undefined} />}
    </section>
  )
}
