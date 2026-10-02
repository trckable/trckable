// Card 1's four lists, who came: where from, to which pages, from where in the
// world, on what. Each keeps the small tabs it had (channels, referrers,
// campaigns; entry, top, exit; countries, cities; devices, browsers, systems).
import { lazy, Suspense } from 'react'
import { BarList } from '../../charts/BarList'
import { Loading } from '../../components/loading/Loading'
import { SearchTerms } from '../../views/DashboardParts'
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

const AiPanel = lazy(() => import('../extras/AiPanel'))
const ScrollDepth = lazy(() => import('../../views/ScrollDepth').then((m) => ({ default: m.ScrollDepth })))

const convOrBounce = (c: CardsCtx) => (c.money ? 'Conv.' : 'Bounce')

export function SourcesPanel({ c }: { c: CardsCtx }) {
  const tabs: TabItem[] = [
    { id: 'channel', label: cardCopy.channels },
    { id: 'referrer', label: cardCopy.referrers },
    { id: 'campaign', label: cardCopy.campaigns },
    // What the AI assistants sent, in Full: the rules are the server's own.
    ...(c.full && !c.shared ? [{ id: 'ai', label: cardCopy.ai }] : []),
    // Google's own numbers, once Search Console is connected. A share link cannot reach them, so it never shows the tab.
    ...(c.mods !== null && shows(c.mods, 'tabs', 'search') && !c.shared ? [{ id: 'search', label: cardCopy.search }] : []),
  ]
  return <SubPanel id="src" label={cardCopy.sources} tabs={tabs} c={c} render={(dim) => sourceList(c, dim)} />
}

function sourceList(c: CardsCtx, dim: string) {
  if (dim === 'search') return <SearchTerms site={c.site} query={c.query} rows={c.rows} full={c.full} />
  if (dim === 'ai') {
    return (
      <Suspense fallback={<Loading height={164} />}>
        <AiPanel site={c.site.id} query={c.query} all={c.visitors} rows={c.rows} onPick={(host) => c.addFilter('referrer', host)} />
      </Suspense>
    )
  }
  return <SourceBars c={c} dim={dim} />
}

function SourceBars({ c, dim }: { c: CardsCtx; dim: string }) {
  const rows = c.sourceRows(dim).slice(0, c.rows)
  const { spark, icons } = useRowExtras(c, dim, rows.map((r) => r.value)) ?? {}
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
  return (
    <BarList
      {...listProps(c, dim)}
      spark={spark}
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
  const { spark } = useRowExtras(c, dim, rows.map((r) => r.value)) ?? {}
  return (
    <BarList
      {...listProps(c, dim)}
      spark={spark}
      dimLabel={DIM_LABEL[dim]}
      subLabel={c.full && dim !== 'page' && !c.money && !c.scrubbing ? 'Bounce' : undefined}
      onPick={(v) => c.addFilter(dim, v)}
      barColor={c.trail ? channelColor(c.trail) : undefined}
      emptyText={!c.perDay(dim) ? cardCopy.perDayEntry : undefined}
      // A sale belongs to a visit, and a visit has one entry page but many pages and sections: nothing to attribute there.
      money={c.full && c.money && !c.scrubbing && dim !== 'page' && dim !== 'group' ? c.fmtMoney : undefined}
      items={rows.map((r) => ({ key: r.value, label: r.value || '/', title: r.value, value: r.visitors, sub: r.bounce_rate, rev: r.revenue }))}
    />
  )
}
