// The Story chart's moments: a soft band over the days each one lasted (green
// for up, blue for down) and a small glass label on the chart that names it in
// plain words with its days and what they added. A click, a tap or Enter on a
// label (or a band, on a phone) tells the story in a card that opens beside it,
// in the page's top layer, so no card clips it. Esc closes it; while it is open
// the other labels are dimmed.
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { useRef, useState } from 'react'
import { AnchoredPop } from '../../components/AnchoredPop'
import type { Span } from '../moments/spans'
import { copy } from '../moments/copy'
import { headline, spanLine } from '../moments/words'
import { SpanCard } from './SpanCard'
import { layoutLabels, widthOf } from './spanLayout'

export interface Geo {
  x: (i: number) => number
  y: (v: number) => number
  vals: number[]
  w: number
}

/** The lane above the plot the labels stand in (charts/plot.ts LANE_H). */
const LANE = 26

interface Props {
  spans: Span[]
  geo: Geo
  site: string
  visitors: number[]
  narrow: boolean
  onOpen: (s: Span) => void
}

export function MomentSpans({ spans, geo, site, visitors, narrow, onOpen }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const [lit, setLit] = useState<string | null>(null)
  const anchor = useRef<HTMLElement | null>(null)
  const n = geo.vals.length
  const step = n > 1 ? geo.x(1) - geo.x(0) : 24
  const base = geo.y(0)
  const peak = (s: Span) => Math.min(...geo.vals.slice(s.i0, s.i1 + 1).map((v) => geo.y(v)), base)
  // A phone has room for one label: the most important moment's. The others are bands to tap.
  const ranked = [...spans].sort((a, b) => b.score - a.score)
  const labelled = narrow ? ranked.slice(0, 1) : ranked
  const placed = layoutLabels(
    labelled.map((s) => ({ id: s.id, center: (geo.x(s.i0) + geo.x(s.i1)) / 2, width: widthOf(narrow ? headline(s).length : headline(s).length + spanLine(s).length + 3), peak: peak(s) })),
    geo.x(Math.max(0, n - 1)) + 16,
    LANE,
  )
  const at = new Map(placed.map((p) => [p.id, p]))
  const show = (e: { currentTarget: HTMLElement }, id: string) => {
    anchor.current = e.currentTarget
    setOpen((o) => (o === id ? null : id))
  }
  const opened = spans.find((s) => s.id === open)
  return (
    <div role="group" aria-label={copy.moments} style={{ display: 'contents' }}>
      {spans.map((s) => {
        const left = geo.x(s.i0) - step / 2
        const width = Math.max(14, geo.x(s.i1) - geo.x(s.i0) + step)
        const mine = at.get(s.id)
        const dim = open != null && open !== s.id
        const on = lit === s.id || open === s.id
        const Icon = s.dir === 'up' ? ArrowUpRight : ArrowDownRight
        const said = headline(s)
        return (
          <div key={s.id} className={`sv-span ${s.dir}${on ? ' on' : ''}${dim ? ' dim' : ''}`} onPointerEnter={() => setLit(s.id)} onPointerLeave={() => setLit(null)}>
            <button
              type="button"
              className="sv-band"
              {...(narrow ? { 'aria-haspopup': 'dialog', 'aria-expanded': open === s.id, 'aria-label': copy.span.open(spanLine(s), said) } : { tabIndex: -1, 'aria-hidden': true })}
              style={{ left, width: Math.max(narrow ? 44 : 14, width), top: 6, height: base - 6 }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => show(e, s.id)}
            />
            {mine && narrow && (
              <span className="sv-label" style={{ left: mine.left, top: mine.top }} aria-hidden="true">
                <span className="sv-label-ic">
                  <Icon size={13} strokeWidth={2.4} />
                </span>
                <b>{said}</b>
              </span>
            )}
            {mine && !narrow && (
              <button
                type="button"
                className="sv-label"
                style={{ left: mine.left, top: mine.top }}
                aria-haspopup="dialog"
                aria-expanded={open === s.id}
                aria-label={copy.span.open(spanLine(s), said)}
                onPointerDown={(e) => e.stopPropagation()}
                onFocus={() => setLit(s.id)}
                onBlur={() => setLit(null)}
                onClick={(e) => show(e, s.id)}
              >
                <span className="sv-label-ic" aria-hidden="true">
                  <Icon size={13} strokeWidth={2.4} />
                </span>
                <b>{said}</b>
                <span className="sv-label-m">{spanLine(s)}</span>
              </button>
            )}
          </div>
        )
      })}
      {opened && (
        <AnchoredPop anchor={anchor} label={headline(opened)} className="sv-story-pop" onClose={() => setOpen(null)}>
          {(close) => (
            <SpanCard
              site={site}
              span={opened}
              visitors={visitors}
              onOpen={() => {
                close()
                onOpen(opened)
              }}
            />
          )}
        </AnchoredPop>
      )}
    </div>
  )
}
