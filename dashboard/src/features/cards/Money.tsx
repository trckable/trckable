// Card 2's first two tabs, what they did: the goals they reached and the
// traffic that paid.
import { BarList, type BarItem } from '../../charts/BarList'
import { channelColor, channelLabel } from '../../lib/palette'
import { DIM_LABEL } from '../overview/dimLabels'
import { cardCopy } from './copy'
import type { CardsCtx } from './ctx'
import { priorOf } from './prior'
import { Tabs } from './Tabs'
import { useState } from 'react'

export function GoalsPanel({ c }: { c: CardsCtx }) {
  // Nothing to list: one line and the button that starts one, not an empty table.
  if (!c.loading && c.goals.length === 0) {
    return (
      <div className="empty goals-empty">
        <span>{cardCopy.noGoals}</span>
        <button type="button" className="btn ghost" onClick={c.onTrackGoal}>
          {cardCopy.trackGoal}
        </button>
      </div>
    )
  }
  return (
    <>
      <div className="tc-tools">
        <button type="button" className="btn ghost" onClick={c.onTrackGoal}>
          {cardCopy.trackGoal}
        </button>
      </div>
      <BarList
        dimLabel={cardCopy.goal}
        subLabel={cardCopy.conv}
        loading={c.loading}
        barColor="var(--accent)"
        whole={c.visitors}
        prior={priorOf(c.prev, 'goal')}
        onPick={(v) => c.addFilter('goal', v)}
        items={(c.scrubbing ? [] : c.goals).slice(0, c.rows).map(
          (r): BarItem => ({ key: r.value, label: <span className="num">{r.value}</span>, title: r.value, value: r.visitors, sub: c.visitors ? r.visitors / c.visitors : 0 }),
        )}
      />
    </>
  )
}

const DIMS = ['channel', 'referrer', 'campaign', 'entry_page']

export function EarnersPanel({ c }: { c: CardsCtx }) {
  const [asked, setAsked] = useState(DIMS[0])
  return (
    <>
      <div className="tc-tools">
        <div className="seg small" role="group" aria-label={cardCopy.credit}>
          <button type="button" aria-pressed={!c.attrFirst} onClick={() => c.onAttr(false)}>
            {cardCopy.closedIt}
          </button>
          <button type="button" aria-pressed={c.attrFirst} onClick={() => c.onAttr(true)}>
            {cardCopy.foundThem}
          </button>
        </div>
      </div>
      <Tabs prefix={`earn-${c.site.id}`} label={cardCopy.earners} tabs={DIMS.map((d) => ({ id: d, label: d === 'entry_page' ? cardCopy.page : DIM_LABEL[d] }))} value={asked} onChange={setAsked} sub />
      <BarList
        dimLabel={DIM_LABEL[asked]}
        valueLabel={cardCopy.customers}
        loading={c.loading}
        byRevenue
        money={c.fmtMoney}
        barColor="var(--money)"
        prior={priorOf(c.prev, asked, true)}
        emptyText={c.scrubbing ? cardCopy.wholePeriod : cardCopy.noRevenue}
        onPick={(v) => c.addFilter(asked, v)}
        items={(c.scrubbing ? [] : (c.revenueDims[asked] ?? [])).slice(0, c.rows).map((r) => ({
          key: r.value,
          label: asked === 'channel' ? channelLabel(r.value) : r.value || '(none)',
          title: r.value,
          value: r.customers ?? 0,
          rev: r.revenue,
          color: asked === 'channel' ? channelColor(r.value) : undefined,
        }))}
      />
    </>
  )
}
