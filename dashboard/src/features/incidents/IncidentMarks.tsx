// The incidents of the period on the main chart: a small mark under the axis
// at the start of each, never over the line. Pointing at one (or focusing it)
// says what it was in a line ("Down 3h 12m · not reachable"); clicking opens
// the site's incident history. Several in one bucket are one mark. Drawn by the
// chart's layer, so it is in the extras' chunk and a shared link never has it.
import { useId, useMemo, useState } from 'react'
import type { Bucket, Site } from '../../lib/api'
import { fmtDay } from '../../lib/dates'
import { bucketOf } from '../notes/markers'
import { navigate } from '../../lib/url'
import type { ChartGeo } from '../moments/marks'
import type { Incident } from './api'
import { copy } from './copy'
import { dayIn, duration, lasted, startOfDay } from './model'
import { incidentsPath } from './route'
import { useNow, usePeriodIncidents } from './useIncidents'
import './incidents.css'

const TIP_W = 250

/** The line an incident has in the chart's tooltip. */
export function lineOf(x: Incident, now: number): string {
  const kind = x.kind === 'down' ? copy.down : copy.quiet
  const why = x.kind === 'down' ? copy.notReachable : copy.noVisits
  return (x.ended_at ? copy.line : copy.lineOpen)(kind, duration(lasted(x, now)), why)
}

/** The bucket of the chart an incident began in, or -1 when the chart does not show it. */
export function bucketFor(x: Incident, labels: string[], bucket: Bucket, tz: string): number {
  if (bucket === 'hour') {
    const hour = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', hour: '2-digit' }).format(new Date(x.started_at * 1000))
    return labels.indexOf(`${dayIn(x.started_at, tz)}T${hour}:00`)
  }
  return bucketOf(dayIn(x.started_at, tz), labels, bucket)
}

export default function IncidentMarks({ g, site, labels, bucket }: { g: ChartGeo; site: Site; labels: string[]; bucket: Bucket }) {
  const now = useNow()
  const from = labels.length ? startOfDay(labels[0].slice(0, 10), site.timezone) : 0
  const { list } = usePeriodIncidents(site.id, from, now, from > 0)
  const marks = useMemo(() => {
    const by = new Map<number, Incident[]>()
    for (const x of list) {
      const i = bucketFor(x, labels, bucket, site.timezone)
      if (i >= 0) by.set(i, [...(by.get(i) ?? []), x])
    }
    return [...by].sort((a, b) => a[0] - b[0])
  }, [list, labels, bucket, site.timezone])
  const [shown, setShown] = useState<number | null>(null)
  const id = useId()
  const open = marks.find(([i]) => i === shown)
  const top = g.y(0)
  return (
    <>
      {marks.map(([i, xs]) => {
        const worst = xs.some((x) => x.kind === 'down') ? 'down' : 'quiet'
        return (
          <button
            key={i}
            type="button"
            className={'inc-mark ' + worst}
            style={{ left: `clamp(9px, ${g.x(i)}px, calc(100% - 9px))`, top }}
            aria-label={copy.marker(xs.length, fmtDay(dayIn(xs[0].started_at, site.timezone)))}
            aria-describedby={shown === i ? id : undefined}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerEnter={() => setShown(i)}
            onPointerLeave={() => setShown(null)}
            onFocus={() => setShown(i)}
            onBlur={() => setShown(null)}
            onClick={() => navigate(incidentsPath(site.domain, true))}
          />
        )
      })}
      {open && (
        <div id={id} role="tooltip" className="inc-tip" style={{ left: Math.max(4, Math.min(g.x(open[0]) - TIP_W / 2, g.w - TIP_W - 4)), top: top - 38, maxWidth: TIP_W }}>
          {lineOf(open[1][0], now)}
          {open[1][0].note && <span className="faint"> · {open[1][0].note}</span>}
          {open[1].length > 1 && <span className="faint"> · {copy.moreOnDay(open[1].length - 1)}</span>}
        </div>
      )}
    </>
  )
}
