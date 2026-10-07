// Card 1's four lists, who came: where from, to which pages, from where in the
// world, on what. Each keeps the small tabs it had (channels, referrers,
// campaigns; entry, top, exit; countries, cities; devices, browsers, systems).
import { Flame } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { BarList } from '../../charts/BarList'
import { Donut } from '../../charts/Donut'
import { fmtCompact } from '../../lib/format'
import type { Row } from '../../lib/api'
import { shows } from '../../lib/modules'
import { channelColor, channelLabel } from '../../lib/palette'
import { DIM_LABEL } from '../overview/dimLabels'
import { cardCopy } from './copy'
import type { CardsCtx } from './ctx'
import { RefMark } from './refIcons'
import { useRowExtras } from './useRowExtras'
import { listProps, SubPanel } from './SubPanel'
import type { TabItem } from './Tabs'

const HeatOverlay = lazy(() => import('../heatmap/HeatOverlay'))
const ScrollDepth = lazy(() => import('../../views/ScrollDepth').then((m) => ({ default: m.ScrollDepth })))

const convOrBounce = (c: CardsCtx) => (c.money ? 'Conv.' : 'Bounce')

export function SourcesPanel({ c }: { c: CardsCtx }) {
  const tabs: TabItem[] = [
    { id: 'channel', label: cardCopy.channels },
    { id: 'referrer', label: cardCopy.referrers },
    { id: 'campaign', label: cardCopy.campaigns },
  ]
  return <SubPanel id="src" label={cardCopy.sources} tabs={tabs} c={c} render={(dim) => <SourceBars c={c} dim={dim} />} />
}

function SourceBars({ c, dim }: { c: CardsCtx; dim: string }) {
  const rows = c.sourceRows(dim).slice(0, c.rows)
  const { icons } = useRowExtras(c, dim, rows.map((r) => r.value)) ?? {}
  const name = (r: Row) => {
    if (dim === 'channel') return channelLabel(r.value)
    if (!icons || !r.value) return r.value || '(none)'
    return (
      <>
        <RefMark host={r.value} icon={icons.has(r.value)} />
        {r.value}
      </>
    )
  }
  const list = (
    <BarList
      {...listProps(c, dim)}
      fat
      dimLabel={DIM_LABEL[dim]}
      subLabel={c.full && !c.scrubbing ? convOrBounce(c) : undefined}
      onPick={(v) => c.addFilter(dim, v)}
      onHover={dim === 'channel' ? c.onSourceHover : undefined}
      money={c.full && c.money && !c.scrubbing ? c.fmtMoney : undefined}
      emptyText={!c.perDay(dim) ? cardCopy.perDayChannels : undefined}
      items={rows.map((r) => ({
        key: r.value,
        label: name(r),
        title: r.value,
        value: r.visitors,
        sub: c.full && c.money && !c.scrubbing ? convOf(r) : r.bounce_rate,
        rev: r.revenue,
        color: dim === 'channel' ? channelColor(r.value) : undefined,
        dim: c.dimTrail && dim === 'channel' && r.value !== c.trail,
      }))}
    />
  )
  if (dim !== 'channel' || c.loading || rows.length === 0) return list
  return (
    <div className="src-split">
      <Donut slices={rows.map((r) => ({ key: r.value, value: r.visitors, color: channelColor(r.value) }))} figure={fmtCompact(c.visitors)} caption={cardCopy.donutLabel} />
      {list}
    </div>
  )
}

/** A row's conversion: customers per visitor. */
const convOf = (r: { visitors: number; customers?: number }) => (r.visitors ? (r.customers ?? 0) / r.visitors : 0)

export function PagesPanel({ c }: { c: CardsCtx }) {
  const tabs: TabItem[] = [
    { id: 'entry_page', label: cardCopy.entry },
    { id: 'page', label: cardCopy.top },
    ...(c.full ? [{ id: 'exit_page', label: cardCopy.exit }] : []),
    // Sections only exist once the site defines them, so the tab appears with the first rule and not before.
    ...(c.full && (c.cur?.dims.group?.length ?? 0) > 0 ? [{ id: 'group', label: cardCopy.sections }] : []),
    // How far down people read. Full only, and not on share links, which only reach the main report.
    ...(c.full && !c.shared ? [{ id: 'scroll', label: cardCopy.scroll }] : []),
  ]
  return (
    <SubPanel id="pages" label={cardCopy.pages} tabs={tabs} c={c}
      render={(dim) =>
        dim === 'scroll' ? (
          <Suspense fallback={null}>
            <ScrollDepth site={c.site} query={c.query} rows={c.rows} />
          </Suspense>
        ) : (
          <PageBars c={c} dim={dim} />
        )
      }
    />
  )
}

function PageBars({ c, dim }: { c: CardsCtx; dim: string }) {
  const rows = (c.perDay(dim) ? c.dims(dim) : []).slice(0, c.rows)
  // A heatmap for the page, once the module is on: not on a share link, and not for sections, which are not a page.
  const [heat, setHeat] = useState<string | null>(null)
  const action = shows(c.mods, 'cards', 'heatmaps') && !c.shared && dim !== 'group' ? { icon: <Flame size={14} aria-hidden="true" />, label: (k: string) => cardCopy.heatmap(k || '/'), onAct: setHeat } : undefined
  return (
    <>
      <BarList
        {...listProps(c, dim)}
        action={action}
        fat
        dimLabel={DIM_LABEL[dim]}
        subLabel={c.full && dim !== 'page' && !c.money && !c.scrubbing ? 'Bounce' : undefined}
        onPick={(v) => c.addFilter(dim, v)}
        barColor={c.trail ? channelColor(c.trail) : undefined}
        emptyText={!c.perDay(dim) ? cardCopy.perDayEntry : undefined}
        // A sale belongs to a visit, and a visit has one entry page but many pages and sections: nothing to attribute there.
        money={c.full && c.money && !c.scrubbing && dim !== 'page' && dim !== 'group' ? c.fmtMoney : undefined}
        items={rows.map((r) => ({ key: r.value, label: r.value || '/', title: r.value, value: r.visitors, sub: r.bounce_rate, rev: r.revenue }))}
      />
      {heat !== null && (
        <Suspense fallback={null}>
          <HeatOverlay site={c.site} path={heat || '/'} query={c.query} onClose={() => setHeat(null)} />
        </Suspense>
      )}
    </>
  )
}
