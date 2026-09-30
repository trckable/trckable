// One of the two cards under the chart: a row of tabs on top, the tab's own
// content below. The tab a person chose is remembered for this site and card,
// in this browser.
import { useId, useState, type ReactNode } from 'react'
import { panelId, tabId, Tabs, type TabItem } from './Tabs'

export interface CardTab extends TabItem {
  render: () => ReactNode
}

const key = (site: string, card: string) => `trckable:tab:${site}:${card}`

function read(site: string, card: string): string | null {
  try {
    return localStorage.getItem(key(site, card))
  } catch {
    return null
  }
}

/** `want`: a tab the address asks for (a funnel in it), which wins over the remembered one while it is there. */
export function TabCard({ card, site, label, tabs, want }: { card: string; site: string; label: string; tabs: CardTab[]; want?: string }) {
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
  if (!active) return null
  const pick = (id: string) => {
    setAsked(id)
    try {
      localStorage.setItem(key(site, card), id)
    } catch {
      /* private mode */
    }
  }
  return (
    <section className="card tc" aria-label={label} data-card={card}>
      <Tabs prefix={prefix} label={label} tabs={tabs} value={active.id} onChange={pick} />
      <div className="tc-body" role="tabpanel" id={panelId(prefix)} aria-labelledby={tabId(prefix, active.id)}>
        {active.render()}
      </div>
    </section>
  )
}
