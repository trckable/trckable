// The tabs both modes have: card 1, who came (sources, pages, locations,
// devices) and card 2, what they did (goals, what paid).
import { lazy, Suspense } from 'react'
import { shows } from '../../lib/modules'
import { DevicesPanel, LocationsPanel, PagesPanel, SourcesPanel } from './Breakdowns'
import { cardCopy } from './copy'
import type { CardsCtx } from './ctx'
import { EarnersPanel, GoalsPanel } from './Money'
import { TabCard, type CardTab } from './TabCard'

const FullButton = lazy(() => import('./FullButton'))

export function whoTabs(c: CardsCtx): CardTab[] {
  return [
    { id: 'sources', label: cardCopy.sources, render: () => <SourcesPanel c={c} /> },
    { id: 'pages', label: cardCopy.pages, render: () => <PagesPanel c={c} /> },
    { id: 'locations', label: cardCopy.locations, render: () => <LocationsPanel c={c} /> },
    { id: 'devices', label: cardCopy.devices, render: () => <DevicesPanel c={c} /> },
  ]
}

export function whatTabs(c: CardsCtx): CardTab[] {
  const tabs: CardTab[] = []
  if (shows(c.mods, 'cards', 'goals')) tabs.push({ id: 'goals', label: cardCopy.goals, render: () => <GoalsPanel c={c} /> })
  if (c.money) tabs.push({ id: 'earners', label: cardCopy.earners, render: () => <EarnersPanel c={c} /> })
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
