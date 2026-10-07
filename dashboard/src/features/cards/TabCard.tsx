// One of the two cards under the chart: a row of tabs on top, the tab's own
// content below. The tab a person chose is remembered for this site and card,
// in this browser.
import { useEffect, useId, useState, type ReactNode } from 'react'
import { Card } from '../../kit/Card'
import { panelId, tabId, Tabs, type TabItem } from '../../kit/Tabs'

export interface CardTab extends TabItem {
  render: () => ReactNode
}

const EVENT = 'trckable:tab'

/** Opens a tab of a card from anywhere (a guide card's action): the card that has it switches. */
export const openTab = (card: string, tab: string) => window.dispatchEvent(new CustomEvent(EVENT, { detail: { card, tab } }))

const key = (site: string, card: string) => `trckable:tab:${site}:${card}`

/** Makes `tab` the one a card opens on for this site, for a card that is not drawn yet (Full's tabs are a chunk of their own). */
export function rememberTab(site: string, card: string, tab: string) {
  try {
    localStorage.setItem(key(site, card), tab)
  } catch {
    /* private mode */
  }
}

function read(site: string, card: string): string | null {
  try {
    return localStorage.getItem(key(site, card))
  } catch {
    return null
  }
}

/** `want`: a tab the address asks for (a funnel in it), which wins over the remembered one while it is there. */
export function TabCard({ card, site, label, tabs, want, more }: { card: string; site: string; label: string; tabs: CardTab[]; want?: string; more?: ReactNode }) {
  const prefix = useId().replace(/:/g, '') + card
  const [asked, setAsked] = useState(() => want ?? read(site, card))
  const [wanted, setWanted] = useState(want)
  if (want !== wanted) {
    setWanted(want)
    if (want) setAsked(want)
  }
  // With nothing picked, the card opens on the tab that was first when it first drew: a tab that arrives later never swaps what is on screen.
  const [first] = useState(() => tabs[0]?.id)
  const active = tabs.find((t) => t.id === asked) ?? tabs.find((t) => t.id === first) ?? tabs[0]
  const pick = (id: string) => {
    setAsked(id)
    try {
      localStorage.setItem(key(site, card), id)
    } catch {
      /* private mode */
    }
  }
  const ids = tabs.map((t) => t.id).join(' ')
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ card: string; tab: string }>).detail
      if (d.card === card && ids.split(' ').includes(d.tab)) pick(d.tab)
    }
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [card, site, ids]) // eslint-disable-line react-hooks/exhaustive-deps -- pick only sets this card's own state
  if (!active) return null
  return (
    <Card variant="open" className="tc" label={label} data={{ 'data-card': card }}>
      {more ? (
        <div className="kit-tabsrow">
          <Tabs prefix={prefix} label={label} tabs={tabs} value={active.id} onChange={pick} />
          <div className="kit-tabsmore">{more}</div>
        </div>
      ) : (
        <Tabs prefix={prefix} label={label} tabs={tabs} value={active.id} onChange={pick} />
      )}
      <div className="kit-panel" role="tabpanel" id={panelId(prefix)} aria-labelledby={tabId(prefix, active.id)}>
        {active.render()}
      </div>
    </Card>
  )
}
