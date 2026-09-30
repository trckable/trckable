// The rings on the main chart: a spike of visitors, or a burst of sales, at
// the bucket it happened in (at most three, chosen by the server). Pointing at
// one, or focusing it, says in one line what it was and who was behind it.
// A chunk of its own, fetched when the browser is idle: a chart never waits
// for its rings.
import { useEffect, useId, useState } from 'react'
import type { Bucket, ReportQuery } from '../../lib/api'
import { extrasApi, type ChartMarker } from './extrasApi'
import { fmtDay } from '../../lib/dates'
import { markerBucket, ringLabel, ringsAt, ringWhy } from './rings'
import './rings.css'

export interface ChartGeo {
  x: (i: number) => number
  y: (v: number) => number
  vals: number[]
  w: number
}

const TIP_W = 290

export default function ChartRings({ g, site, query, labels, bucket, money }: { g: ChartGeo; site: string; query: ReportQuery; labels: string[]; bucket: Bucket; money: (minor: number) => string }) {
  const [found, setFound] = useState<{ key: string; list: ChartMarker[] } | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const id = useId()
  const which = markerBucket(bucket)
  const key = [site, query.from, query.to, which, JSON.stringify(query.filters ?? [])].join('|')
  useEffect(() => {
    const ctl = new AbortController()
    extrasApi
      .markers(site, query, which, ctl.signal)
      .then((d) => setFound({ key, list: d.markers }))
      .catch(() => undefined) // rings are a garnish: no rings is the answer to any failure
    return () => ctl.abort()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed by content: query is a new object each render
  if (!found || found.key !== key) return null
  const rings = ringsAt(found.list, labels)
  const shown = rings.find((r) => r.i === open)
  return (
    <>
      {rings.map(({ i, m }) => {
        const why = ringWhy(m, money)
        return (
          <button
            key={m.t}
            type="button"
            className={m.kind === 'sale' ? 'ring-mark sale' : 'ring-mark'}
            style={{ left: g.x(i), top: g.y(g.vals[i] ?? 0) }}
            aria-label={ringLabel(fmtDay(m.t.slice(0, 10), { weekday: true }), why)}
            aria-describedby={open === i ? id : undefined}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerEnter={() => setOpen(i)}
            onPointerLeave={() => setOpen(null)}
            onFocus={() => setOpen(i)}
            onBlur={() => setOpen(null)}
          />
        )
      })}
      {shown && (
        <div id={id} role="tooltip" className="ring-tip" style={{ left: Math.max(4, Math.min(g.x(shown.i) - TIP_W / 2, g.w - TIP_W - 4)), top: g.y(g.vals[shown.i] ?? 0) - 12, maxWidth: TIP_W }}>
          {ringWhy(shown.m, money)}
        </div>
      )}
    </>
  )
}
