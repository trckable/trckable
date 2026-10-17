// The busy moment as a soft band on the hourly chart, from the hour it began to the hour it ended
// (or now), with its name and how many times the usual. Drawn in the moments' layer, over the plot.
import { LANE_H } from '../../charts/plot'
import type { ChartGeo } from '../moments/marks'
import { signals } from './copy'
import { localHour } from './surge'
import { useSurgeMoment } from './useSurgeMoment'
import { times } from '../../lib/times'
import './surgeBand.css'

export function SurgeBand({ site, tz, started, g, labels }: { site: string; tz: string; started: number; g: ChartGeo; labels: string[] }) {
  const surge = useSurgeMoment(site, started)
  if (!surge) return null
  const i0 = labels.indexOf(localHour(surge.started, tz).hour)
  const end = surge.ended ? labels.indexOf(localHour(surge.ended, tz).hour) : labels.length - 1
  if (i0 < 0) return null
  const i1 = Math.max(i0, end < 0 ? labels.length - 1 : end)
  const step = labels.length > 1 ? g.x(1) - g.x(0) : 24
  return (
    <i className="surge-band" role="img" aria-label={signals.surge.bandLabel(times(surge.times))} style={{ left: g.x(i0) - step / 2, width: g.x(i1) - g.x(i0) + step, top: LANE_H, height: g.y(0) - LANE_H }}>
      <b>{signals.surge.bandLabel(times(surge.times))}</b>
    </i>
  )
}
