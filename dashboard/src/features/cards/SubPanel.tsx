// What card 1's lists share: the small tabs of one list, and the props every
// list gets (the rows it shows, the change against before, the whole the
// shares are of).
import { useEffect, useState } from 'react'
import type { CardsCtx } from './ctx'
import { priorOf } from './prior'
import { Tabs, type TabItem } from '../../kit/Tabs'
import { TAB_EVENT } from './TabCard'

/** The small tabs of one list, and the list of the one picked. */
export function SubPanel({ id, label, tabs, c, render, foot, noFoot }: { id: string; label: string; tabs: TabItem[]; c: CardsCtx; render: (dim: string) => React.ReactNode; foot?: string; noFoot?: (dim: string) => boolean }) {
  const [asked, setAsked] = useState(tabs[0].id)
  const active = tabs.some((t) => t.id === asked) ? asked : tabs[0].id
  // openTab(id, tab) from elsewhere (the chart's Mentions chip) picks one of these small tabs.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ card: string; tab: string }>).detail
      if (d.card === id) setAsked(d.tab)
    }
    window.addEventListener(TAB_EVENT, on)
    return () => window.removeEventListener(TAB_EVENT, on)
  }, [id])
  return (
    <>
      {tabs.length > 1 && <Tabs prefix={`${id}-${c.site.id}`} label={label} tabs={tabs} value={active} onChange={setAsked} sub />}
      {render(active)}
      {foot && !c.loading && !noFoot?.(active) && <p className="list-foot">{foot}</p>}
    </>
  )
}

/** Every list shares these: the rows a list shows, the change against before and the whole the shares are of. */
export function listProps(c: CardsCtx, dim: string) {
  return { loading: c.loading, valueLabel: c.soFar, whole: c.visitors, prior: priorOf(c.prev, dim) }
}

