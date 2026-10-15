// Where a known source (or a tagged link) brought its first visits or a jump,
// on a chart: a small pill with the source's badge and what it added, on a row
// above the baseline. Pointing at one says "Hacker News +40"; opening it says
// it in words ("Hacker News sent 40 visitors on Oct 2") with one action, "See
// these visitors", which narrows the dashboard to that source. Markers that
// would touch are one (the biggest, with how many). Drawn by both the main
// chart's layer and the day-by-day chart's, from one setting (settings.ts).
import { Link2 } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Bucket, Site } from '../../lib/api'
import { fmtDay } from '../../lib/dates'
import { readView, setView } from '../../lib/url'
import { LANE_H } from '../../charts/plot'
import type { ChartGeo } from '../moments/marks'
import { copy } from './copy'
import { biggest, cluster, place, type Jump } from './model'
import { useJumps } from './useJumps'
import './markers.css'

const POP_W = 270
/** Pixels above the baseline the pills sit at (the mentions' pins sit under them). */
const RISE = 54

function Badge({ j }: { j: Jump }) {
  return (
    <span className="sm-badge" aria-hidden="true">
      {j.kind === 'link' ? <Link2 size={11} strokeWidth={2.25} /> : j.badge}
    </span>
  )
}

export interface SourceMarkersProps {
  g: ChartGeo
  site: Site
  from: string
  to: string
  labels: string[]
  /** The chart's visitors per bucket: what says whether a source explains a day's rise. */
  visitors: number[]
  bucket: Bucket
  /** Opens Explore with the filter (the day-by-day chart is in Story). */
  explore?: boolean
}

export default function SourceMarkers(p: SourceMarkersProps) {
  const { g } = p
  const { sources, links } = useJumps(p.site.id, p.from, p.to)
  const marks = useMemo(() => cluster(place([...sources, ...links], p.labels, p.bucket), g.x, [g.x(0) + 12, g.w - 30]), [sources, links, p.labels, p.bucket, g.w]) // eslint-disable-line react-hooks/exhaustive-deps -- g.x changes with the width, which is listed
  const lead = useMemo(() => biggest(sources, p.labels, p.visitors), [sources, p.labels, p.visitors])
  const [hover, setHover] = useState<number | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    if (open === null) return
    const away = (e: PointerEvent) => !(e.target as Element).closest?.('.sm-pop, .sm-mark') && setOpen(null)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  if (!marks.length && !lead) return null
  // Its own row: under the moments' lane and over the mentions' pins, so none touches another.
  const top = Math.max(LANE_H + 40, g.y(0) - RISE)
  const see = (j: Jump) => {
    const view = readView(new URLSearchParams(location.search))
    setView({ filters: [...view.filters.filter((f) => f.dim !== j.filter.dim), j.filter], day: undefined, ...(p.explore ? { v: 'explore' as const } : {}) })
    setOpen(null)
  }
  const at = marks.find((m) => m.i === open)
  const tip = at ? undefined : marks.find((m) => m.i === hover)
  const left = (m: { at: number }) => Math.max(4, Math.min(m.at - POP_W / 2, g.w - POP_W - 4))
  return (
    <div ref={root} role="group" aria-label={copy.group} className="sm-marks">
      {lead && (
        <p className="sm-line" style={{ left: g.x(0) + 4, top: LANE_H + 2, maxWidth: g.w - g.x(0) - 12 }}>
          {copy.line(fmtDay(lead.day), lead.name, lead.added)}
        </p>
      )}
      {marks.map((m) => (
        <button
          key={m.i}
          type="button"
          className={`sm-mark ${m.jump.kind}${open === m.i ? ' on' : ''}`}
          style={{ left: m.at, top }}
          aria-label={copy.mark(m.jump.name, m.jump.added, fmtDay(m.jump.day), m.more.length)}
          aria-expanded={open === m.i}
          aria-controls={open === m.i ? id : undefined}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerEnter={() => setHover(m.i)}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(m.i)}
          onBlur={() => setHover(null)}
          onClick={() => setOpen(open === m.i ? null : m.i)}
        >
          <Badge j={m.jump} />
          <span className="sm-n num" aria-hidden="true">
            +{m.jump.added}
          </span>
          {m.more.length > 0 && (
            <i className="sm-more num" aria-hidden="true">
              +{m.more.length}
            </i>
          )}
        </button>
      ))}
      {tip && (
        <div role="tooltip" className="sm-tip" style={{ left: left(tip), top: top - 36, maxWidth: POP_W }}>
          {copy.chip(tip.jump.name, tip.jump.added)}
        </div>
      )}
      {at && (
        <div id={id} role="dialog" aria-label={copy.sent(at.jump.name, at.jump.visitors, fmtDay(at.jump.day))} className="sm-pop" style={{ left: left(at), top: top + 20, width: POP_W }}>
          <p className="sm-says">
            <Badge j={at.jump} />
            <span>{copy.sent(at.jump.name, at.jump.visitors, fmtDay(at.jump.day))}</span>
          </p>
          {at.more.length > 0 && <p className="sm-also faint">{copy.alsoNear(at.more.length)}</p>}
          <button type="button" className="btn sm-see" autoFocus onClick={() => see(at.jump)}>
            {copy.see}
          </button>
        </div>
      )}
    </div>
  )
}
