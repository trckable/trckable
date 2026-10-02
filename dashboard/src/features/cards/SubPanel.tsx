// What card 1's lists share: the small tabs of one list, and the props every
// list gets (the rows it shows, the change against before, the whole the
// shares are of).
import { useState } from 'react'
import type { CardsCtx } from './ctx'
import { priorOf } from './prior'
import { Tabs, type TabItem } from './Tabs'

/** The small tabs of one list, and the list of the one picked. */
export function SubPanel({ id, label, tabs, c, render }: { id: string; label: string; tabs: TabItem[]; c: CardsCtx; render: (dim: string) => React.ReactNode }) {
  const [asked, setAsked] = useState(tabs[0].id)
  const active = tabs.some((t) => t.id === asked) ? asked : tabs[0].id
  return (
    <>
      {tabs.length > 1 && <Tabs prefix={`${id}-${c.site.id}`} label={label} tabs={tabs} value={active} onChange={setAsked} sub />}
      {render(active)}
    </>
  )
}

/** Every list shares these: the rows a list shows, the change against before and the whole the shares are of. */
export function listProps(c: CardsCtx, dim: string) {
  return { loading: c.loading, valueLabel: c.soFar, whole: c.visitors, prior: priorOf(c.prev, dim) }
}

