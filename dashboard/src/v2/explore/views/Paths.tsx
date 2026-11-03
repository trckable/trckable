// Paths: how visitors move through the site. Four numbers, the busiest routes drawn as soft bands through up to three pages (a
// phone gets the list alone), and the list of routes. A tap on a route follows it and looks at just the visits that start there.
import { useState } from 'react'
import { useWidth } from '../../../charts/useWidth'
import { midTruncate } from '../../../features/signals/surge'
import { fmtFixed, fmtInt, fmtPct } from '../../../lib/format'
import { EmptyTab } from './PeopleTable'
import { XEmpty } from '../../ui/XBits'
import { XIco } from '../../ui/XIcons'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import { keyOf, layoutFlow, NODE_WIDTH, STEPS } from '../data/paths'
import { valueOf } from '../filters'
import type { PathRoute, Paths } from '../types'

/** Routes the list shows before "Show all". */
const LISTED = 8
const FLOW_H = 260
/** Under this width the flow has no room for its page names: the list stands alone. */
const FLOW_MIN = 480

/** How a route stands against the one followed: it, or the others once one is. */
const state = (sel: string | null, key: string): string => {
  if (sel === null) return ''
  return sel === key ? ' on' : ' dim'
}

const name = (p: string): string => (p === '/' ? copy.homePage : p)

interface Tile {
  icon: string
  label: string
  val: string
  /** The value in full, when it is shortened. */
  hint?: string
  detail: string
}

function tiles(d: Paths): Tile[] {
  const page = (icon: string, label: string, p: Paths['first']): Tile =>
    p ? { icon, label, val: midTruncate(name(p.path), 22), hint: name(p.path), detail: copy.pathsVisitsOf(fmtInt(p.visits)) } : { icon, label, val: '–', detail: '' }
  return [
    { icon: 'people', label: copy.pathsVisits, val: fmtInt(d.visits), detail: '' },
    { icon: 'pages', label: copy.pathsPerVisit, val: fmtFixed(d.pages, 1), detail: '' },
    page('click', copy.pathsFirst, d.first),
    page('leave', copy.pathsLast, d.last),
  ]
}

/** The same compact tiles as Tech's leaders (TopTiles), with nothing to tap. */
function Tiles({ d }: { d: Paths }) {
  return (
    <div className="xkw">
      <div className="kcs xk xtops">
        {tiles(d).map((t) => (
          <div key={t.label} className="kc ns xtop">
            <div className="kt">
              <span className="ki">
                <XIco name={t.icon} className="" style={{ color: 'var(--mk-lime)' }} />
              </span>
              <span className="kl">{t.label}</span>
            </div>
            <div className="kv" title={t.hint}>{t.val}</div>
            <div className="kd">{t.detail}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Flow({ d, sel, onPick }: { d: Paths; sel: string | null; onPick: (r: PathRoute) => void }) {
  const { ref, w } = useWidth<HTMLDivElement>()
  const flow = w >= FLOW_MIN ? layoutFlow(d.routes.filter((r) => r.steps.length > 1), w, FLOW_H) : null
  const by = new Map(d.routes.map((r) => [keyOf(r), r]))
  const height = flow ? Math.max(FLOW_H, ...flow.nodes.map((n) => n.y + n.h)) : 0
  return (
    <div ref={ref} className="xpf" style={{ height }}>
      {flow && (
        <svg width={w} height={height} role="group" aria-label={copy.pathsFlow}>
          {flow.bands.map((b) => (
            <g key={b.key} className={`xpf-band${state(sel, b.key)}`} onClick={() => onPick(by.get(b.key) as PathRoute)}>
              <title>{`${b.steps.map(name).join(' → ')}: ${fmtInt(b.visits)}`}</title>
              {b.d.map((p, i) => <path key={i} d={p} />)}
            </g>
          ))}
          {flow.nodes.map((n) => {
            const last = n.col === flow.cols - 1
            return (
              <g key={n.key} className={n.page === null ? 'xpf-node left' : 'xpf-node'}>
                <rect x={n.x} y={n.y} width={NODE_WIDTH} height={n.h} rx={2} />
                <text x={last ? n.x - 6 : n.x + NODE_WIDTH + 6} y={n.y + n.h / 2} dy="0.35em" textAnchor={last ? 'end' : 'start'}>
                  {n.page === null ? copy.pathsLeft : midTruncate(name(n.page), 22)}
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

function Row({ r, of, goals, sel, onPick }: { r: PathRoute; of: number; goals: boolean; sel: string | null; onPick: (r: PathRoute) => void }) {
  const full = r.steps.map(name)
  return (
    <button type="button" className={`xrw${state(sel, keyOf(r))}`} title={full.join(' → ')} onClick={() => onPick(r)}>
      <span className="mono xpl-steps">
        {r.steps.map((s, i) => (
          <span key={i}>{i > 0 && <i aria-hidden="true"> → </i>}{midTruncate(name(s), 26)}</span>
        ))}
        {r.steps.length < STEPS && <em> → {copy.pathsLeft}</em>}
      </span>
      <span className="mk-n">{fmtInt(r.visits)}</span>
      <span className="mk-n xpl-share">{fmtPct(r.visits / (of || 1))}</span>
      {goals && <span className="xpl-conv">{r.converted > 0 ? copy.pathsConverted(fmtInt(r.converted)) : ''}</span>}
    </button>
  )
}

export function PathsView({ x, d }: { x: XCtx; d: Paths }) {
  const [sel, setSel] = useState<string | null>(null)
  const entry = valueOf(x.filters, 'entry_page')
  if (d.routes.length === 0)
    return x.filters.length ? (
      <XEmpty title={copy.emptyFiltered} hint={copy.emptyFilteredHint}>
        <button type="button" className="xb" onClick={x.clearFilters}>
          {copy.clearFilters}
        </button>
      </XEmpty>
    ) : (
      <EmptyTab x={x} />
    )
  const pick = (r: PathRoute) => {
    const k = keyOf(r)
    setSel(sel === k ? null : k)
    if (sel !== k && entry !== r.steps[0]) x.pick('entry_page', r.steps[0])
  }
  const shown = Math.max(LISTED, x.limit)
  const goals = d.goals && d.routes.some((r) => r.converted > 0)
  return (
    <>
      <Tiles d={d} />
      {d.single > 0 && <p className="xpf-one">{copy.pathsOnePage(fmtPct(d.single / (d.visits || 1)))}</p>}
      <Flow d={d} sel={sel} onPick={pick} />
      <h4 className="xpl-h">{copy.pathsTop}</h4>
      <div className={`xt xpl${goals ? ' goals' : ''}`}>
        {d.routes.slice(0, shown).map((r) => <Row key={keyOf(r)} r={r} of={d.visits} goals={goals} sel={sel} onPick={pick} />)}
      </div>
      {d.routes.length > shown && (
        <button type="button" className="xb" onClick={x.showAll}>
          {copy.showAll(d.routes.length)}
        </button>
      )}
      <p className="xchg-rest">{copy.pathsNote}</p>
    </>
  )
}
