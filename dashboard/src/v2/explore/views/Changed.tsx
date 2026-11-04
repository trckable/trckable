// What changed: Overview's own cards, the one sentence that says what moved, and the biggest changes of every table as one ranked list.
import { lazy, Suspense, useEffect, useState } from 'react'
import { useNotes } from '../../../features/notes/useNotes'
import type { Report, Site } from '../../../lib/api'
import { fmtInt } from '../../../lib/format'
import { isShared } from '../../../lib/me'
import { can } from '../../../lib/permissions'
import { openSettings } from '../../../lib/settings'
import { NotesSheet } from '../../ui/BriefingSheets'
import { mult } from '../../briefing/model'
import { explain, movers, type Cause, type Metric } from '../../why/model'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import { ChangedChart } from './chartChunk'
import type { Overview as Model } from '../types'
import { Downtime } from './Downtime'
import { XKcs } from '../../ui/XKcs'
import { MoverChips, MoverList, nameOf } from './Movers'

const NoteDialog = lazy(() => import('../../../components/NoteDialog').then((m) => ({ default: m.NoteDialog })))

function sentence(name: string, kind: string, pct: number | null, diff: number, top?: Cause): string {
  if (kind === 'few') return copy.sayFew
  if (kind === 'flat') return copy.sayFlat
  if (kind === 'mix') return copy.sayMix(name)
  if (pct === null) return copy.sayNew(name)
  const moved = pct >= 100 ? copy.sayRose(name, mult(pct / 100 + 1)) : (pct < 0 ? copy.sayFell : copy.sayRose)(name, `${Math.abs(Math.round(pct))}%`)
  if (!top) return copy.sayEnd(moved)
  // "Mostly" only when it is more than half of the move.
  const place = top.value === '/' ? copy.theHomePage : nameOf(top.value)
  return (diff !== 0 && top.diff / diff > 0.5 ? copy.sayMostly : copy.sayLed)(moved, place)
}

/** The daily email's lines from the same numbers: the sentence, the four cards, and the biggest changes. */
export function mailOf(d: Model & { report: Report }) {
  const cur = { ...d.report.current, series: d.report.current.series ?? [] }
  const prev = d.report.previous ? { ...d.report.previous, series: d.report.previous.series ?? [] } : undefined
  const w = prev ? explain(cur, prev, 'visitors') : null
  return {
    headline: w ? sentence(copy.metric.visitors, w.kind, w.pct, w.diff, w.causes[0]) : copy.sayChoose,
    facts: d.kcs.map((k) => ({ n: k.val, u: k.label.toLowerCase(), t: k.note.t })),
    claims: (w?.causes ?? []).slice(0, 3).map((k) => `${nameOf(k.value)}: ${fmtInt(k.was)} → ${fmtInt(k.now)}`),
  }
}

/** The period's notes and the daily email, which have no other home on this screen. */
function Tools({ site, to, notes, sheet, setSheet }: { site: Site; to: string; notes: ReturnType<typeof useNotes>; sheet: boolean; setSheet: (on: boolean) => void }) {
  const [add, setAdd] = useState(false)
  const canNote = can('note.write') && !isShared()
  useEffect(() => {
    const open = () => canNote && setAdd(true)
    window.addEventListener('trckable:note', open)
    return () => window.removeEventListener('trckable:note', open)
  }, [canNote])
  if (isShared()) return null
  return (
    <div className="xchg-tools">
      <button type="button" className="xb" onClick={() => setSheet(true)}>{copy.notesBtn(notes.notes.length)}</button>
      {canNote && <button type="button" className="xb" onClick={() => openSettings(site, 'alerts')}>{copy.dailyEmail}</button>}
      {sheet && <NotesSheet site={site.domain} siteId={site.id} notes={notes.notes} onChanged={notes.load} onClose={() => setSheet(false)} onAdd={canNote ? () => setAdd(true) : undefined} />}
      {add && (
        <Suspense fallback={null}>
          <NoteDialog site={site} day={to} today={to} days={[]} notes={notes.notes} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); notes.load() }} />
        </Suspense>
      )}
    </div>
  )
}

/** The chart's place: its height is held from the first paint, so the cards under it do not move when it arrives. */
function ChartSlot({ x, report, notes, onNotes }: { x: XCtx; report: Report; notes: { day: string; text: string }[]; onNotes: () => void }) {
  return (
    <div className="xchg-chart">
      <Suspense fallback={<i className="sk" />}>
        <ChangedChart x={x} report={report} notes={notes} onNotes={onNotes} />
      </Suspense>
    </div>
  )
}

/** Too little to compare: the period's own numbers, the one line that says why there is no comparison, and the one way to widen the period. */
function Plain({ x, d }: { x: XCtx; d: Model }) {
  return (
    <>
      <XKcs items={d.kcs} />
      <p className="xchg-few">{copy.fewHere}</p>
      {x.widen && (
        <button type="button" className="xb" onClick={x.widen}>
          {copy.widen}
        </button>
      )}
    </>
  )
}

/** The biggest changes of every table: which number to explain, and the ranked list. */
function Biggest({ metrics, metric, setMetric, list, fmt }: { metrics: Metric[]; metric: Metric; setMetric: (m: Metric) => void; list: Cause[]; fmt: (n: number) => string }) {
  return (
    <>
      <div className="xsec xchg-head">
        <span>{copy.biggestChanges}<em className="xmv-note">{copy.moversNote}</em></span>
        <span className="xchg-kinds" role="group" aria-label={copy.explainNumber}>
          {metrics.map((m) => (
            <button key={m} type="button" aria-pressed={m === metric} className={m === metric ? 'on' : ''} onClick={() => setMetric(m)}>{copy.metric[m]}</button>
          ))}
        </span>
      </div>
      {list.length > 0 ? <MoverList list={list} fmt={fmt} /> : <div className="mk-quiet">{copy.nothingMoved}</div>}
    </>
  )
}

export function Changed({ x, d }: { x: XCtx; d: Model & { report: Report } }) {
  const cur = { ...d.report.current, series: d.report.current.series ?? [] }
  const prev = d.report.previous ? { ...d.report.previous, series: d.report.previous.series ?? [] } : undefined
  const metrics = (['visitors', 'pageviews', 'signups', 'revenue'] as Metric[]).filter((m) => (m === 'signups' ? !!cur.signup : m !== 'revenue' || !!cur.money))
  const [metric, setMetric] = useState<Metric>('visitors')
  const notes = useNotes(x.site.id, { from: x.query.from, to: x.query.to }, () => undefined)
  const [sheet, setSheet] = useState(false)
  // Only where the chart can tell the same numbers as the cards: the whole site, not a share of it, and not on a shared page.
  const chart = !isShared() && x.filters.length === 0 && cur.series.length > 0 && cur.kpis.visitors > 0
  const w = prev ? explain(cur, prev, metric) : null
  const list = prev ? movers(cur, prev, metric) : []
  const fmt = (n: number) => (metric === 'revenue' ? x.money(n) : fmtInt(n))
  const few = w?.kind === 'few' && list.length === 0
  return (
    <>
      <p className="xchg-say">{w ? sentence(copy.metric[metric], w.kind, w.pct, w.diff, w.causes[0]) : copy.sayChoose}</p>
      <MoverChips list={w?.causes ?? []} metric={metric} fmt={fmt} />
      {chart && <ChartSlot x={x} report={d.report} notes={notes.notes} onNotes={() => setSheet(true)} />}
      {few ? <Plain x={x} d={d} /> : <Biggest metrics={metrics} metric={metric} setMetric={setMetric} list={list} fmt={fmt} />}
      <Downtime down={d.down} />
      <Tools site={x.site} to={x.query.to} notes={notes} sheet={sheet} setSheet={setSheet} />
    </>
  )
}
