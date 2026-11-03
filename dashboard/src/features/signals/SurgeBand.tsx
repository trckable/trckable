// The busy moment on the hourly chart: a soft lime band behind the line from the hour it began to the hour it ended
// (or now), and one marker on the lane with its name ("Busy · 56 at peak", "Busy now · 53"). Pointing at the marker
// says the moment in a small tip; a click (or a tap) keeps it open, with "Only <source>" and a close. When the page was
// opened from the busy card the tip starts open, once. On a phone the tip is a small sheet under the chart's top.
// Drawn in the moments' layer, over the plot.
import { X } from 'lucide-react'
import { useId, useState } from 'react'
import { sameFilter } from '../../lib/filterSet'
import type { Filter } from '../../lib/api'
import { readView, setView } from '../../lib/url'
import { aside, MARK_GAP, type ChartGeo } from '../moments/marks'
import { Where } from './BusyBody'
import { signals } from './copy'
import { busyCount, busySpan, localHour, surgeChip, surgeFilter, type Surge } from './surge'
import { useSurgeMoment } from './useSurgeMoment'
import './surgeBand.css'

const t = signals.surge
const TIP_W = 280
/** The marker's label is about this many pixels a letter, plus its dot and padding. */
const LETTER = 6.4
const PAD = 26

export function SurgeBand({ site, tz, started, g, labels, filters, taken }: { site: string; tz: string; started: number; g: ChartGeo; labels: string[]; filters: Filter[]; taken: number[] }) {
  const surge = useSurgeMoment(site, started)
  if (!surge) return null
  const i0 = labels.indexOf(localHour(surge.started, tz).hour)
  if (i0 < 0) return null
  return <Moment surge={surge} tz={tz} g={g} labels={labels} i0={i0} filters={filters} taken={taken} />
}

function Moment({ surge, tz, g, labels, i0, filters, taken }: { surge: Surge; tz: string; g: ChartGeo; labels: string[]; i0: number; filters: Filter[]; taken: number[] }) {
  const [kept, keep] = useState(true) // open once when the page was opened on it, then as any other tip
  const [near, setNear] = useState(false)
  const id = useId()
  const end = surge.ended ? labels.indexOf(localHour(surge.ended, tz).hour) : labels.length - 1
  const i1 = Math.max(i0, end < 0 ? labels.length - 1 : end)
  const step = labels.length > 1 ? g.x(1) - g.x(0) : 24
  const left = g.x(i0) - step / 2
  const width = g.x(i1) - g.x(i0) + step
  const live = !surge.ended
  const text = live ? t.markNow(busyCount(surge)) : t.markPeak(busyCount(surge))
  const half = (text.length * LETTER + PAD) / 2
  const at = Math.min(Math.max(aside(left + width / 2, taken, MARK_GAP / 2 + half), half + 4), g.w - half - 4)
  const open = kept || near
  const only = surgeFilter(surge)
  const applied = !!only && filters.some((f) => sameFilter(f, only))
  const narrow = () => {
    if (!only) return
    const v = readView(new URLSearchParams(location.search))
    const now = v.xf ?? v.filters
    setView({ xf: now.some((f) => sameFilter(f, only)) ? now.filter((f) => !sameFilter(f, only)) : [...now, only] })
  }
  const close = () => {
    keep(false)
    setNear(false)
  }
  return (
    <>
      <i className="surge-band" data-on={open ? '1' : undefined} aria-hidden="true" style={{ left, width, top: g.top, height: g.y(0) - g.top }} />
      <button
        type="button"
        className="surge-mark"
        data-live={live ? '1' : undefined}
        data-on={open ? '1' : undefined}
        style={{ left: at, top: g.lane }}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerEnter={() => setNear(true)}
        onPointerLeave={() => setNear(false)}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        onClick={() => keep(!kept)}
      >
        <i className="bz-dot" data-live={live ? '1' : undefined} aria-hidden="true" />
        {text}
      </button>
      {open && (
        <div id={id} role="dialog" aria-label={t.busyTitle} className="moment-tip surge-tip" data-kept={kept ? '1' : undefined} style={{ ['--tx' as string]: `${Math.max(4, Math.min(at - TIP_W / 2, g.w - TIP_W - 4))}px`, ['--ty' as string]: `${g.lane - 14}px` }} onPointerDown={(e) => e.stopPropagation()}>
          <div className="mt-head">
            <b>{live ? t.busyNow : t.busyTitle}</b>
            <span className="mt-day num">{busySpan(surge, tz)}</span>
          </div>
          <p className="mt-line">
            <span>{[live ? t.tipNow(surge.online) : t.tipPeak(busyCount(surge)), surgeChip(surge)].join(' · ')}</span>
          </p>
          <div className="bz">
            <Where surge={surge} />
          </div>
          {kept && (
            <div className="surge-tip-acts">
              {only && surge.why.source && (
                <button type="button" className="surge-only" aria-pressed={applied} onClick={narrow}>
                  {t.only(surge.why.source)}
                </button>
              )}
              <button type="button" className="surge-x" aria-label={t.close} title={t.close} onClick={close}>
                <X size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
