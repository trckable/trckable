// The Goals tab: the goals reached in the period, each with its count, how that stands against a usual day, and a mark when it
// stands out. A row opens that goal's own page.
import { ChevronRight, Plus } from 'lucide-react'
import { Loading } from '../../components/loading/Loading'
import { SummaryCards, type SumItem } from '../ui/SummaryCards'
import { XEmpty, XError } from '../ui/XBits'
import { Lock } from '../explore/views/Lock'
import { useTab } from '../explore/data/useExplore'
import { useLoad } from '../explore/data/useLoad'
import { copy } from '../explore/copy'
import type { XCtx } from '../explore/ctx'
import type { Funnel } from '../explore/types'
import { fmtInt } from '../../lib/format'
import { more, type GoalList, type GoalRow } from '../../lib/apiMore'
import { can } from '../../lib/permissions'
import { setView } from '../../lib/url'
import { SuggestedGoal } from './SuggestedGoal'
import { stand } from './standCopy'
import { nameOf, sourceWords, versus } from './standing'
import './standing.css'

/** The period as a line: one point per day. */
function Spark({ n }: { n: number[] }) {
  const top = Math.max(1, ...n)
  const pts = n.map((v, i) => `${n.length < 2 ? 60 : (i / (n.length - 1)) * 120},${22 - (v / top) * 20}`)
  return (
    <svg className="gl-spark" viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.length === 1 ? `0,${pts[0].split(',')[1]} 120,${pts[0].split(',')[1]}` : pts.join(' ')} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Tiles({ d }: { d: GoalList }) {
  const out = d.goals.filter((g) => g.out)
  const names = out.map(nameOf).join(', ') || undefined
  // A label is a span, so a long one wraps; the shared card cuts a plain string.
  const items: SumItem[] = [
    { key: 'reached', label: <span>{stand.listReached}</span>, val: fmtInt(d.reached) },
    { key: 'out', label: <span>{stand.listOut}</span>, val: out.length ? fmtInt(out.length) : stand.listNone, sub: names, subTitle: names, tone: out.length ? 'up' : '' },
  ]
  if (d.source) items.push({ key: 'source', label: <span>{stand.listBest}</span>, val: sourceWords(d.source), sub: d.source_share > 0 ? stand.listShare(`${Math.round(d.source_share * 100)}%`) : undefined })
  return (
    <div className="mk gs-tiles">
      <SummaryCards items={items} />
    </div>
  )
}

function Row({ g }: { g: GoalRow }) {
  return (
    <li>
      <button type="button" className={`gl-row${g.out ? ' out' : ''}`} aria-label={stand.rowOpen(nameOf(g))} onClick={() => setView({ xg: g.goal })}>
        <span className="gl-name" title={nameOf(g)}>{nameOf(g)}</span>
        <b className="gl-n">{fmtInt(g.count)}</b>
        <span className="gl-vs">{versus(g)}</span>
        <Spark n={g.spark} />
        <ChevronRight className="gl-go" size={16} aria-hidden="true" />
      </button>
    </li>
  )
}

export function GoalsList({ x }: { x: XCtx }) {
  const { from, to } = x.query
  const list = useLoad<GoalList>(`goals|${x.site.id}|${from}|${to}`, (signal) => more.goalList(x.site.id, { from, to }, signal), true)
  // The funnel's read says whether the site counts any goal and which pages could be one.
  const base = useTab('funnels', x.data, true)
  const f = base.state === 'ok' ? (base.data as Funnel) : null
  if (list.state === 'loading') return <Loading height={240} label={stand.loading} />
  if (f && !f.goalsOn && (list.state === 'error' || list.data.goals.length === 0)) return <Lock k="goals" x={x} />
  if (list.state === 'error') return <XError title={stand.failed} hint={list.message} onRetry={list.retry} />
  const d = list.data
  return (
    <>
      <Tiles d={d} />
      {d.goals.length === 0 ? (
        <XEmpty title={stand.empty} hint={stand.emptyHint} />
      ) : (
        <ul className="gl-list">
          <li className="gl-head" aria-hidden="true">
            <span>{stand.colGoal}</span>
            <span>{stand.colReached}</span>
            <span>{stand.colUsual}</span>
            <span>{stand.colTrend}</span>
            <span />
          </li>
          {d.goals.map((g) => (
            <Row key={g.goal} g={g} />
          ))}
        </ul>
      )}
      {f && <SuggestedGoal site={x.site} pages={f.pages.map((p) => p.name)} goals={f.goals.map((g) => ({ label: g.name, value: g.name, visitors: g.v }))} />}
      {f?.goalsOn && can('goal.create') && (
        <button type="button" className="xb" id="xTrack" onClick={() => x.connect('goals')}>
          <Plus aria-hidden="true" />
          {copy.trackGoal}
        </button>
      )}
    </>
  )
}
