// Card 1's last two lists, where from in the world and on what: a chunk of
// their own that is fetched once the browser is idle (Sources and Pages, the
// tabs a card opens on, stay in the first load).
import { lazy, Suspense } from 'react'
import { BarList } from '../../charts/BarList'
import { Loading } from '../../components/loading/Loading'
import { countryName, flag } from '../../lib/format'
import { channelColor } from '../../lib/palette'
import { DIM_LABEL, PLACE_LABEL } from '../overview/dimLabels'
import { cardCopy } from './copy'
import type { CardsCtx } from './ctx'
import { listProps, SubPanel } from './SubPanel'
import type { TabItem } from './Tabs'
import { laterCopy } from './copyLater'

const WorldMap = lazy(() => import('../../views/WorldMap').then((m) => ({ default: m.WorldMap })))

export function LocationsPanel({ c }: { c: CardsCtx }) {
  const tabs: TabItem[] = [
    { id: 'country', label: laterCopy.countries },
    ...(c.full ? [{ id: 'region', label: laterCopy.regions }, { id: 'city', label: laterCopy.cities }] : []),
    ...(c.mapOn ? [{ id: 'map', label: laterCopy.map }] : []),
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
    { id: 'device', label: laterCopy.device },
    { id: 'browser', label: laterCopy.browser },
    { id: 'os', label: laterCopy.os },
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
          emptyText={!c.perDay(dim) ? laterCopy.perDayDevice : undefined}
          money={c.full && c.money && !c.scrubbing ? c.fmtMoney : undefined}
          items={(c.perDay(dim) ? c.dims(dim) : []).slice(0, c.rows).map((r) => ({ key: r.value, label: r.value || 'Unknown', value: r.visitors, sub: r.bounce_rate, rev: r.revenue }))}
        />
      )}
    />
  )
}
