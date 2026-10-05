// What the Data view says on its own, once a day at most, as one side card:
// the most important thing since the last visit; and, in a new site's first
// week, when there is no such thing, a card for a feature not yet used. Never
// on Live (the Dashboard draws it only for the Data view), never on a shared
// link. A card someone asked for (a marker's, the Revenue tile's) takes its
// place until it is closed (SideCard's `asked`). In the chart extras' chunk.
import { useEffect, useState } from 'react'
import type { Point, Site } from '../../lib/api'
import { todayIn } from '../../lib/dates'
import { canChange } from '../../lib/me'
import { heatDone, useHeatAsk } from '../heatmap/guide'
import { HeatGuide } from '../heatmap/HeatGuide'
import { readView, useLocation } from '../../lib/url'
import { Discover } from './Discover'
import { inFirstWeek } from './firstWeek'
import { OneThing } from './OneThing'
import { markUsed } from './store'
import { markShown, putAway, toldLately, visitOf } from './visit'
import { useOneThing } from './useOneThing'
import './moments.css'

/** Not before the first visit: a site waiting for one has its install card. */
export default function Ambient({ site, series }: { site: Site; series: readonly Point[] }) {
  return site.last_event_at ? <Say site={site} series={series} /> : null
}

function Say({ site, series }: { site: Site; series: readonly Point[] }) {
  const today = todayIn(site.timezone)
  const [seen] = useState(() => visitOf(site.id, today))
  const [gone, setGone] = useState(seen.gone === today)
  const [fresh] = useState(() => inFirstWeek(site.created_at, Date.now() / 1000))
  const { params } = useLocation()
  const full = readView(params).mode === 'full'
  useEffect(() => {
    if (full) markUsed('full')
  }, [full])
  const found = useOneThing(site.id, seen.prev, today, toldLately(seen, today))
  const away = () => {
    putAway(site.id, today)
    setGone(true)
  }
  const items = found?.items
  // A busy page, with heatmaps off: the one card of the day when there is nothing else to say.
  const wantsHeat = !!found && !found.items.length && !gone && canChange() && !heatDone(site.id)
  const heat = useHeatAsk(site.id, wantsHeat)
  useEffect(() => {
    if (items?.length) markShown(site.id, today, items.map((p) => p.id))
  }, [items]) // eslint-disable-line react-hooks/exhaustive-deps -- once the findings are in
  if (gone || !found) return null
  if (found.items.length) return <OneThing site={site} found={found} since={seen.prev} series={series} onAway={away} />
  if (!canChange()) return null
  if (wantsHeat && !heat) return null // not yet known: the other card would only be swapped for it
  if (heat?.ask && heat.path) return <HeatGuide site={site} path={heat.path} views={heat.views ?? 0} query={{ from: today, to: today }} onAway={away} />
  return <Discover site={site} today={today} fresh={fresh} series={series} onAway={away} />
}
