// The moments on the main chart: a small marker for each on a lane above the
// plot (never on the line, so the curve stays readable), at most six and one a
// day, the most important first, with the same words as the card on opening.
// Pointing at or focusing one says it in a line, unless a card is open (one
// thing at a time: then it only lights up); a click applies its filter (and its
// day) through the address and opens the card with the numbers, and the chart
// tints the day it is about. Each is a button in the page's tab order and has a
// shape of its own, so none depends on colour. In the chart extras' chunk, fetched when the
// chart is first drawn.
import { useEffect, useId, useMemo, useState } from 'react'
import type { Bucket, Point, ReportQuery, Site } from '../../lib/api'
import { fmtDay, todayIn } from '../../lib/dates'
import { sameFilter } from '../../lib/filterSet'
import { readView, setView } from '../../lib/url'
import { rangeOf } from '../../lib/dashQuery'
import { LANE_H } from '../../charts/plot'
import { patchFor } from './apply'
import { copy } from './copy'
import { HIT, HIT_MS } from './focus'
import { iconOf } from './kinds'
import { MARK_EDGE, pickMarks, placePins, tipOf, type ChartGeo, type Mark } from './marks'
import { openMark } from './open'
import type { Pin } from './pins'
import { settle } from './settle'
import { useMoments } from './useMoments'
import { say } from './words'
import { WhyCard } from './WhyCard'
import './moments.css'

const TIP_W = 290
/** The middle of the lane above the plot that the markers sit on. */
const LANE = LANE_H / 2

export interface LayerProps {
  g: ChartGeo
  site: Site
  query: ReportQuery
  labels: string[]
  /** The chart's own buckets, for the small chart on a card. */
  series: readonly Point[]
  bucket: Bucket
  /** Writes an amount in the site's currency (a sale is only a moment where the reader sees revenue: the server leaves it out otherwise). */
  money: (minor: number) => string
  onShare?: () => void
}

export default function MomentLayer(p: LayerProps) {
  const { g } = p
  const pins = useMoments(p.site.id, p.query, p.bucket)
  const fmt = p.money
  const [shown, setShown] = useState<number | null>(null)
  // The marker "See it" lit: for a moment, so the click always has something to show.
  const [hit, setHit] = useState<string | null>(null)
  const id = useId()
  const opened = openMark.use()
  // The card says what the chart says: one number for one moment.
  const current = useMemo(() => opened && settle(opened, pins), [opened, pins])
  useEffect(() => {
    let off: ReturnType<typeof setTimeout> | undefined
    const on = (e: Event) => {
      setHit((e as CustomEvent<string>).detail)
      clearTimeout(off)
      off = setTimeout(() => setHit(null), HIT_MS)
    }
    window.addEventListener(HIT, on)
    return () => {
      window.removeEventListener(HIT, on)
      clearTimeout(off)
    }
  }, [])
  // The card belongs to the chart it was opened on: when the chart goes (another site, Replay), so does it.
  useEffect(() => () => openMark.set(null), [])
  const placed = useMemo(() => placePins(pins ?? [], p.labels, p.bucket), [pins, p.labels, p.bucket])
  const marks = useMemo(() => pickMarks(placed, g.x, [g.x(0), g.w - MARK_EDGE]), [placed, g.w, p.labels.length]) // eslint-disable-line react-hooks/exhaustive-deps -- g.x changes with the width and the number of buckets, which are listed
  /** Applies a pin to the address; `drop` is the pin it replaces, whose filter goes. */
  const apply = (pin: Pin, drop?: Pin) => {
    const view = readView(new URLSearchParams(location.search))
    const today = todayIn(p.site.timezone)
    const filters = view.filters.filter((f) => !drop?.filters.some((d) => sameFilter(d, f)))
    setView(patchFor(pin, { filters, range: rangeOf(view, today), today, bucket: p.bucket }))
  }
  const click = (m: Mark) => {
    apply(m.pin)
    openMark.set({ pins: [m.pin, ...m.more], at: 0 })
  }
  // One thing at a time: with a card open, a marker is only lit by the pointer, never explained.
  const tip = tipOf(marks, shown, !!current)
  // The first marker also says what the markers are.
  const teaching = !!tip && tip.i === marks[0]?.i
  const day = current && placed.find((q) => q.pin.id === current.pins[current.at].id)
  return (
    <>
      {marks.length > 0 && <i className="moment-lane" aria-hidden="true" style={{ left: g.x(0), width: g.w - g.x(0), top: LANE }} />}
      {day && <i className={`moment-day ${day.pin.kind}`} aria-hidden="true" style={{ left: g.x(day.i), width: Math.max(8, g.x(1) - g.x(0)), top: LANE_H, height: g.y(0) - LANE_H }} />}
      <div role="group" aria-label={copy.moments} className="moment-marks">
        {marks.map((m) => {
          const Icon = iconOf(m.pin.kind)
          const line = say(m.pin, fmt).line
          return (
            <button
              key={m.pin.id}
              type="button"
              className={`moment-mark ${m.pin.kind}${m.more.length ? ' many' : ''}${current?.pins[0].id === m.pin.id ? ' on' : ''}${hit && (m.pin.id === hit || m.more.some((q) => q.id === hit)) ? ' hit' : ''}`}
              style={{ left: m.at, top: LANE }}
              aria-label={copy.marker(fmtDay(m.pin.day ?? ''), line, m.more.length)}
              aria-describedby={tip?.i === m.i ? id : undefined}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerEnter={() => setShown(m.i)}
              onPointerLeave={() => setShown(null)}
              onFocus={() => setShown(m.i)}
              onBlur={() => setShown(null)}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return
                setShown(null)
                openMark.set(null)
              }}
              onClick={() => click(m)}
            >
              <Icon size={12} strokeWidth={2.25} aria-hidden="true" />
              {m.more.length > 0 && <i className="moment-n num" aria-hidden="true">{m.more.length > 98 ? '99+' : m.more.length + 1}</i>}
            </button>
          )
        })}
      </div>
      {current && (
        <WhyCard
          open={current}
          site={p.site}
          series={p.series}
          money={fmt}
          onShare={p.onShare}
          onPick={(at) => {
            apply(current.pins[at], current.pins[current.at])
            openMark.set({ pins: current.pins, at })
          }}
        />
      )}
      {tip && (
        <div id={id} role="tooltip" className="moment-tip" style={{ left: Math.max(4, Math.min(tip.at - TIP_W / 2, g.w - TIP_W - 4)), top: LANE + 20, maxWidth: TIP_W }}>
          {copy.tipLead(say(tip.pin, fmt).line, fmtDay(tip.pin.day ?? ''))}
          {tip.more.length > 0 && <span className="faint"> · {copy.more(tip.more.length)}</span>}
          {teaching && <span className="faint"> · {copy.chipsMark}</span>}
        </div>
      )}
    </>
  )
}
