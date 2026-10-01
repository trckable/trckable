// Card 1's four lists, who came: where from, to which pages, from where in the
// world, on what. Each keeps the small tabs it had (channels, referrers,
// campaigns; entry, top, exit; countries, cities; devices, browsers, systems).
import { lazy, Suspense, useState } from 'react'
import { BarList } from '../../charts/BarList'
import { Loading } from '../../components/loading/Loading'
import { SearchTerms } from '../../views/DashboardParts'
import { countryName, flag } from '../../lib/format'
import { shows } from '../../lib/modules'
import { channelColor, channelLabel } from '../../lib/palette'
import { DIM_LABEL, PLACE_LABEL } from '../overview/dimLabels'
import { cardCopy } from './copy'
import type { CardsCtx } from './ctx'
import { priorOf } from './prior'
import { Tabs, type TabItem } from './Tabs'

const WorldMap = lazy(() => import('../../views/WorldMap').then((m) => ({ default: m.WorldMap })))
const AiPanel = lazy(() => import('../extras/AiPanel'))
const ScrollDepth = lazy(() => import('../../views/ScrollDepth').then((m) => ({ default: m.ScrollDepth })))

/** The small tabs of one list, and the list of the one picked. */
function SubPanel({ id, label, tabs, c, render }: { id: string; label: string; tabs: TabItem[]; c: CardsCtx; render: (dim: string) => React.ReactNode }) {
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
function listProps(c: CardsCtx, dim: string) {
  return { loading: c.loading, valueLabel: c.soFar, whole: c.visitors, prior: priorOf(c.prev, dim) }
}

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
  return (
    <BarList
      {...listProps(c, dim)}
      dimLabel={DIM_LABEL[dim]}
      subLabel={c.full && !c.scrubbing ? convOrBounce(c) : undefined}
      onPick={(v) => c.addFilter(dim, v)}
      onHover={dim === 'channel' ? c.onSourceHover : undefined}
      money={c.full && c.money && !c.scrubbing ? c.fmtMoney : undefined}
      emptyText={!c.perDay(dim) ? cardCopy.perDayChannels : undefined}
      items={c.sourceRows(dim).slice(0, c.rows).map((r) => ({
        key: r.value,
        label: dim === 'channel' ? channelLabel(r.value) : r.value || '(none)',
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
          <BarList
            {...listProps(c, dim)}
            dimLabel={DIM_LABEL[dim]}
            subLabel={c.full && dim !== 'page' && !c.money && !c.scrubbing ? 'Bounce' : undefined}
            onPick={(v) => c.addFilter(dim, v)}
            barColor={c.trail ? channelColor(c.trail) : undefined}
            emptyText={!c.perDay(dim) ? cardCopy.perDayEntry : undefined}
            // A sale belongs to a visit, and a visit has one entry page but many pages and sections: nothing to attribute there.
            money={c.full && c.money && !c.scrubbing && dim !== 'page' && dim !== 'group' ? c.fmtMoney : undefined}
            items={(c.perDay(dim) ? c.dims(dim) : []).slice(0, c.rows).map((r) => ({ key: r.value, label: r.value || '/', title: r.value, value: r.visitors, sub: r.bounce_rate, rev: r.revenue }))}
          />
        )
      }
    />
  )
}

export function LocationsPanel({ c }: { c: CardsCtx }) {
  const tabs: TabItem[] = [
    { id: 'country', label: cardCopy.countries },
    ...(c.full ? [{ id: 'region', label: cardCopy.regions }, { id: 'city', label: cardCopy.cities }] : []),
    ...(c.mapOn ? [{ id: 'map', label: cardCopy.map }] : []),
  ]
  return (
    <SubPanel id="loc" label={cardCopy.locations} tabs={tabs} c={c}
      render={(dim) =>
        dim === 'map' ? (
          <Suspense fallback={<Loading height={180} />}>
            <WorldMap rows={c.dims('country')} onPick={(code) => c.addFilter('country', code)} />
          </Suspense>
        ) : (
          <BarList
            {...listProps(c, dim)}
            dimLabel={PLACE_LABEL[dim] ?? 'City'}
            subLabel={c.full && !c.money && !c.scrubbing ? 'Bounce' : undefined}
            onPick={(v) => c.addFilter(dim, v)}
            barColor={c.trail ? channelColor(c.trail) : undefined}
            items={c.dims(dim).slice(0, c.rows).map((r) => ({
              key: r.value,
              label: dim === 'country' ? `${flag(r.value)} ${countryName(r.value)}` : r.value || 'Unknown',
              title: dim === 'country' ? countryName(r.value) : r.value,
              value: r.visitors,
              sub: r.bounce_rate,
              rev: r.revenue,
            }))}
            money={c.full && c.money && !c.scrubbing ? c.fmtMoney : undefined}
          />
        )
      }
    />
  )
}

export function DevicesPanel({ c }: { c: CardsCtx }) {
  const tabs: TabItem[] = [
    { id: 'device', label: cardCopy.device },
    { id: 'browser', label: cardCopy.browser },
    { id: 'os', label: cardCopy.os },
  ]
  return (
    <SubPanel id="dev" label={cardCopy.devices} tabs={tabs} c={c}
      render={(dim) => (
        <BarList
          {...listProps(c, dim)}
          dimLabel={DIM_LABEL[dim]}
          subLabel={c.full && !c.money && !c.scrubbing ? 'Bounce' : undefined}
          onPick={(v) => c.addFilter(dim, v)}
          barColor={c.trail ? channelColor(c.trail) : undefined}
          emptyText={!c.perDay(dim) ? cardCopy.perDayDevice : undefined}
          money={c.full && c.money && !c.scrubbing ? c.fmtMoney : undefined}
          items={(c.perDay(dim) ? c.dims(dim) : []).slice(0, c.rows).map((r) => ({ key: r.value, label: r.value || 'Unknown', value: r.visitors, sub: r.bounce_rate, rev: r.revenue }))}
        />
      )}
    />
  )
}
