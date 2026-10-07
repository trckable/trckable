// Card 2's second tab, what they did: the traffic that paid. A chunk of its own
// (Compact's second card opens on Goals, so this waits for the tab).
import { useState } from 'react'
import { BarList } from '../../charts/BarList'
import { EmptyState } from '../../components/EmptyState'
import { canChange } from '../../lib/me'
import { openSettings } from '../../lib/settings'
import { channelColor, channelLabel } from '../../lib/palette'
import { DIM_LABEL } from '../overview/dimLabels'
import { cardCopy } from './copy'
import type { CardsCtx } from './ctx'
import { Tabs } from '../../kit/Tabs'
import { laterCopy } from './copyLater'

const DIMS = ['channel', 'referrer', 'campaign', 'entry_page']

/** Where the money came from: revenue, customers, what each visitor from there is worth, and how the revenue moved against the period before. */
export default function EarnersPanel({ c }: { c: CardsCtx }) {
  const [asked, setAsked] = useState(DIMS[0])
  const visitors = new Map(c.dims(asked).map((r) => [r.value, r.visitors]))
  const before = new Map((c.prev?.revenue_dims?.[asked] ?? []).map((r) => [r.value, r.revenue]))
  return (
    <>
      <div className="kit-tools">
        <div className="seg small" role="group" aria-label={laterCopy.credit}>
          <button type="button" aria-pressed={!c.attrFirst} onClick={() => c.onAttr(false)}>
            {laterCopy.closedIt}
          </button>
          <button type="button" aria-pressed={c.attrFirst} onClick={() => c.onAttr(true)}>
            {laterCopy.foundThem}
          </button>
        </div>
      </div>
      <Tabs prefix={`earn-${c.site.id}`} label={cardCopy.earners} tabs={DIMS.map((d) => ({ id: d, label: d === 'entry_page' ? laterCopy.page : DIM_LABEL[d] }))} value={asked} onChange={setAsked} sub />
      <BarList
        dimLabel={DIM_LABEL[asked]}
        valueLabel={laterCopy.customers}
        subLabel={laterCopy.perVisitor}
        fmtSub={c.fmtMoney}
        loading={c.loading}
        byRevenue
        money={c.fmtMoney}
        barColor="var(--money)"
        emptyText={c.scrubbing ? laterCopy.wholePeriod : undefined}
        emptyState={c.scrubbing ? undefined : <EmptyState line={laterCopy.noRevenue} action={canChange() ? laterCopy.noRevenueAction : undefined} onAction={() => openSettings(c.site, 'payments')} />}
        onPick={(v) => c.addFilter(asked, v)}
        items={(c.scrubbing ? [] : (c.revenueDims[asked] ?? [])).slice(0, c.rows).map((r) => {
          const seen = visitors.get(r.value)
          return {
            key: r.value,
            label: asked === 'channel' ? channelLabel(r.value) : r.value || '(none)',
            title: r.value,
            value: r.customers ?? 0,
            rev: r.revenue,
            sub: seen && r.revenue !== undefined ? r.revenue / seen : undefined,
            moved: { now: r.revenue ?? 0, was: before.get(r.value) },
            color: asked === 'channel' ? channelColor(r.value) : undefined,
          }
        })}
      />
    </>
  )
}
