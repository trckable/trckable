// What changed: Overview's own cards, the one sentence that says what moved, and the biggest changes as steps from then to now.
import { lazy, Suspense, useEffect, useState } from 'react'
import { whenIdle } from '../../../lib/lazyLoad'
import { useNotes } from '../../../features/notes/useNotes'
import type { Report, Site } from '../../../lib/api'
import { fmtInt } from '../../../lib/format'
import { isShared } from '../../../lib/me'
import { can } from '../../../lib/permissions'
import { openSettings } from '../../../lib/settings'
import { NotesSheet } from '../../ui/BriefingSheets'
import { mult } from '../../briefing/model'
import { Waterfall } from '../../ui/Waterfall'
import { explain, type Cause, type Dim, type Metric } from '../../why/model'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import { openExplore } from '../open'
import type { Overview as Model, Tab } from '../types'
import { Downtime } from './Downtime'

const ChangedChart = lazy(() => import('./ChangedChart'))
const NoteDialog = lazy(() => import('../../../components/NoteDialog').then((m) => ({ default: m.NoteDialog })))

const OPEN: Record<Dim, { tab: Tab; filter: string }> = {
  referrer: { tab: 'sources', filter: 'referrer' },
  entry_page: { tab: 'pages', filter: 'page' },
  country: { tab: 'countries', filter: 'country' },
  device: { tab: 'devices', filter: 'device' },
}

/** A cause in words: no value is Direct, and the bare slash is the home page. */
const nameOf = (v: string) => (v === '/' ? copy.homePage : v || copy.direct)

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
  const [go, setGo] = useState(false)
  useEffect(() => whenIdle(() => setGo(true)), [])
  return (
    <div className="xchg-chart">
      {go && (
        <Suspense fallback={null}>
          <ChangedChart x={x} report={report} notes={notes} onNotes={onNotes} />
        </Suspense>
      )}
    </div>
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
  const fmt = (n: number) => (metric === 'revenue' ? x.money(n) : fmtInt(n))
  return (
    <>
      <p className="xchg-say">{w ? sentence(copy.metric[metric], w.kind, w.pct, w.diff, w.causes[0]) : copy.sayChoose}</p>
      {chart && <ChartSlot x={x} report={d.report} notes={notes.notes} onNotes={() => setSheet(true)} />}
      <div className="xsec xchg-head">
        <span>{copy.biggestChanges}</span>
        <span className="xchg-kinds" role="group" aria-label={copy.explainNumber}>
          {metrics.map((m) => (
            <button key={m} type="button" aria-pressed={m === metric} className={m === metric ? 'on' : ''} onClick={() => setMetric(m)}>{copy.metric[m]}</button>
          ))}
        </span>
      </div>
      {w && w.dim && w.causes.length > 0 ? (
        <Waterfall
          was={w.was}
          wasLabel={copy.wasLabel}
          nowLabel={copy.nowLabel}
          fmt={fmt}
          steps={[
            ...w.causes.map((k) => ({ key: k.value, label: nameOf(k.value), onPick: () => openExplore(OPEN[k.dim].tab, [{ dim: OPEN[k.dim].filter, value: k.value }]) })).map((st, i) => ({ ...st, diff: w.causes[i].diff, title: `${st.label}: ${fmt(w.causes[i].was)} → ${fmt(w.causes[i].now)}` })),
            ...(w.rest !== 0 ? [{ key: '__rest', label: copy.everythingElse, diff: w.rest }] : []),
          ]}
        />
      ) : (
        <div className="mk-quiet">{copy.nothingMoved}</div>
      )}
      <Downtime down={d.down} />
      <Tools site={x.site} to={x.query.to} notes={notes} sheet={sheet} setSheet={setSheet} />
    </>
  )
}
