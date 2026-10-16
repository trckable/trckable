// Explore's first table: the four numbers, how the period was shaped, any downtime, and the top pages and sources.
import type { Filter, Point, Site } from '../../../lib/api'
import type { Range } from '../../../lib/dates'
import { fmtInt, fmtPct } from '../../../lib/format'
import { sourceName } from '../../briefing/model'
import { copy as bcopy } from '../../briefing/copy'
import { bounceNote, noteOf, usualNote } from '../../briefing/kpis'
import { siteNow } from '../../briefing/chart'
import { usualBand } from '../../briefing/useSlices'
import { useHistory } from '../../briefing/useHistory'
import { useSlice } from '../../briefing/useSeries'
import { judge, usualBounce } from '../../briefing/usual'
import { useEffect, useState } from 'react'
import { useUptime } from '../../briefing/hooks'
import { useNow } from '../../../features/incidents/useIncidents'
import { Kcs, type Kc } from '../../ui/KpiCard'
import { rowsFor, useBands, type Answer } from '../useData'
import { copy } from '../copy'
import { XSec, XTable } from '../ui'
import { WORDS } from './Tables'

function downWords(pct: number | null, lost: number): string {
  if (pct === null) return copy.cards.checksOff
  return lost > 0 ? bcopy.downFor(Math.round(lost / 60)) : copy.cards.noDowntime
}

/** The period's people as a line with its heights at the side and the hours under it. */
function Shape({ series, hourly, now }: { series: Point[]; hourly: boolean; now: boolean }) {
  const pts = series.map((p) => p.visitors)
  if (pts.length < 2) return <div className="mk-quiet" style={{ padding: '8px 0' }}>{copy.notEnough}</div>
  const top = Math.max(1, ...pts)
  const mx = top * 1.12
  const W = 520
  const H = 130
  const X = (i: number) => (W * i) / (pts.length - 1)
  const Y = (v: number) => H - 4 - ((H - 12) * v) / mx
  const line = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p).toFixed(1)}`).join(' ')
  const label = (i: number) => series[i].t.slice(hourly ? 11 : 5, hourly ? 16 : 10)
  return (
    <div className="shp">
      <div className="yl">
        <span>{fmtInt(top)}</span>
        <span>{fmtInt(top / 2)}</span>
        <span>{fmtInt(0)}</span>
      </div>
      <div className="sv">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {[0, 0.5, 1].map((t) => (
            <line key={t} x1={0} x2={W} y1={Y(top * t).toFixed(1)} y2={Y(top * t).toFixed(1)} stroke="#1d1f23" vectorEffect="non-scaling-stroke" />
          ))}
          <polygon points={`0,${H} ${line} ${W},${H}`} fill="rgba(255,255,255,.04)" />
          <polyline points={line} fill="none" stroke="#c6ff3a" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="xl">
          <span>{label(0)}</span>
          <span>{label(Math.floor(pts.length / 2))}</span>
          <span>{now ? copy.now : label(pts.length - 1)}</span>
        </div>
      </div>
    </div>
  )
}

/** What the server says the same weekday brought, as a band, for the people who match the filters (one day only). */
function useDayBand(site: Site, day: string, on: boolean, filters: Filter[]) {
  const [got, setGot] = useState<{ key: string; b: Awaited<ReturnType<typeof usualBand>> } | null>(null)
  const key = `${site.id}|${day}|${filters.map((f) => f.dim + f.value).join('&')}`
  useEffect(() => {
    if (!on) return
    let live = true
    void usualBand(site.id, day, filters).then((b) => live && setGot({ key, b }))
    return () => {
      live = false
    }
    // The filters are keyed by content.
  }, [key, on, site.id, day]) // eslint-disable-line react-hooks/exhaustive-deps
  return on && got && got.key === key ? got.b : null
}

export function Overview({ site, range, a, filters, comparing, day, onPick, goTo, label }: {
  site: Site
  range: Range
  a: Answer
  filters: Filter[]
  comparing: boolean
  day: string | null
  onPick: (dim: string, value: string) => void
  goTo: (tab: 'pages' | 'sources') => void
  label: string
}) {
  const { cur: whole, prev } = a
  const up = useUptime(site, range)
  const nowSec = useNow()
  const live = range.to === siteNow(site.timezone).slice(0, 10)
  const nowT = siteNow(site.timezone)
  // The line stops at the hour it is; hours to come hold nothing to draw.
  const cur = live ? { ...whole, series: whole.series.filter((p) => p.t.slice(0, a.bucket === 'hour' ? 13 : 10) <= nowT.slice(0, a.bucket === 'hour' ? 13 : 10)) } : whole
  const goalValue = (whole.goals ?? []).find((g) => g.visitors > 0)?.value
  const goalSeries = useSlice(site, range, a.bucket as 'hour' | 'day', goalValue ? { dim: 'goal', value: goalValue } : null)
  const hist = useHistory(site, nowT.slice(0, 10), false, true)
  const band = useDayBand(site, range.to, !!day && !comparing, filters)
  const hourly = a.bucket === 'hour'
  const pages = (cur.dims.page ?? []).slice(0, 5).map((r) => r.value)
  const srcs = (cur.dims.referrer ?? []).slice(0, 5).map((r) => r.value)
  const pb = useBands(site, day ?? range.to, !!day && !comparing, filters, 'page', pages)
  const sb = useBands(site, day ?? range.to, !!day && !comparing, filters, 'referrer', srcs)
  const goal = (whole.goals ?? []).find((g) => g.visitors > 0)
  const v0 = whole.kpis
  const v = v0.visitors
  const bu = hist.daily ? usualBounce(hist.daily, nowT.slice(0, 10), day ? new Date(range.to + 'T12:00:00Z').getUTCDay() : null) : null
  const before = bcopy.before[range.from === range.to ? 'today' : 'range']
  const downNote = downWords(up.pct, up.lost)
  const vals = (f: (p: Point) => number) => cur.series.map(f)
  const kcs: Kc[] = [
    { key: 'people', icon: 'people', label: copy.cards.people, val: fmtInt(v), note: band ? usualNote(v, band.c, judge(v, band)) : noteOf(v, prev?.kpis.visitors, before), vals: vals((p) => p.visitors), dn: false },
    goal
      ? { key: 'goal', icon: 'goal', label: (goal.label || goal.value).replace(/^./, (c) => c.toUpperCase()), val: fmtInt(goal.visitors), note: noteOf(goal.visitors, prev?.goals?.find((g) => g.value === goal.value)?.visitors, before), vals: goalSeries.slice(0, cur.series.length), col: '#7f9cf5' }
      : { key: 'views', icon: 'click', label: bcopy.views, val: fmtInt(v0.pageviews), note: noteOf(v0.pageviews, prev?.kpis.pageviews, before), vals: vals((p) => p.pageviews), col: '#7f9cf5' },
    { key: 'uptime', icon: 'uptime', label: copy.cards.uptime, val: up.pct === null ? '–' : `${up.pct.toFixed(2)}%`, note: { t: downNote, dn: up.lost > 0 }, vals: up.pct === null ? [] : [100, 100, 100], lo: 90, hi: 117, dn: up.lost > 0 },
    { key: 'leave', icon: 'leave', label: copy.cards.left, val: fmtPct(v0.bounce_rate), note: bu === null ? noteOf(v0.bounce_rate, prev?.kpis.bounce_rate, before) : bounceNote(v0.bounce_rate, bu), vals: vals((p) => p.bounce_rate ?? 0), lo: 0, hi: 0.8, col: '#7f9cf5' },
  ]
  const pct = prev ? Math.round(((v - prev.kpis.visitors) / Math.max(1, prev.kpis.visitors)) * 100) : 0
  const pageRows = rowsFor(cur, prev, 'page', (x) => x, pb)
  const srcRows = rowsFor(cur, prev, 'referrer', (x) => sourceName(x) || x, sb)
  return (
    <>
      <Kcs items={kcs} className="kcs xk" h={56} />
      {comparing && prev && <XSec l={copy.vsPrevWord(label)} r={`${fmtInt(v)} vs ${fmtInt(prev.kpis.visitors)} (${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%)`} />}
      <XSec l={copy.shape} r={hourly ? copy.perHour : copy.perDay} />
      <Shape series={cur.series} hourly={hourly} now={range.to >= new Date().toISOString().slice(0, 10)} />
      <XSec l={copy.downtime} r={up.list.length ? copy.incident(up.list.length) : copy.none} />
      {up.list.map((x) => (
        <div className="sale" key={x.id}>
          <span className="mk-tag refund">{copy.down}</span>
          <span className="gn">{copy.toWord(new Date(x.started_at * 1000).toISOString().slice(11, 16), new Date((x.ended_at ?? nowSec) * 1000).toISOString().slice(11, 16))}</span>
          <span className="amt">{copy.minutes(Math.round(((x.ended_at ?? nowSec) - x.started_at) / 60))}</span>
        </div>
      ))}
      <div className="x2">
        <div>
          <XSec l={copy.topPages} r={copy.tapToFilter} />
          <XTable rows={pageRows} head={copy.page} comparing={comparing} mono limit={5} words={WORDS} empty={null} onPick={(x) => onPick('page', x)} go={{ label: copy.showAllPages, run: () => goTo('pages') }} />
        </div>
        <div>
          <XSec l={copy.topSources} />
          <XTable rows={srcRows} head={copy.source} comparing={comparing} limit={5} words={WORDS} empty={null} onPick={(x) => onPick('referrer', x)} go={{ label: copy.showAllSources, run: () => goTo('sources') }} />
        </div>
      </div>
    </>
  )
}
