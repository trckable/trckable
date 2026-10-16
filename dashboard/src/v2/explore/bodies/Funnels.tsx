// Goals & funnels: where people drop off between the steps, an editor for the steps, and the goals against what they
// usually reach.
import { useEffect, useState } from 'react'
import type { FunnelResult, FunnelStep, Site } from '../../../lib/api'
import { more } from '../../../lib/apiMore'
import type { Range } from '../../../lib/dates'
import { fmtInt } from '../../../lib/format'
import { readView, setView } from '../../../lib/url'
import { setupOf } from '../../briefing/steps'
import { SetupLock } from '../../ui/ConnectPlaceholder'
import { Rng } from '../../ui/RangeBar'
import { copy } from '../copy'
import type { Answer } from '../useData'
import { XSec, XSub } from '../ui'

const name = (s: FunnelResult | FunnelStep, label?: string) => (s.kind === 'page' ? s.value : (label ?? s.value).replace(/^./, (c) => c.toUpperCase()))

/** The steps asked for in the address, else the way in and the goals the site has. */
export function stepsOf(a: Answer, asked?: FunnelStep[]): FunnelStep[] {
  if (asked?.length) return asked
  const goals = (a.cur.goals ?? []).slice(0, 3).map((g): FunnelStep => ({ kind: 'goal', value: g.value }))
  const page = (a.cur.dims.entry_page ?? [])[0]?.value ?? '/'
  return [{ kind: 'page', value: page }, ...goals]
}

export function Funnels({ site, range, a, onGoal }: { site: Site; range: Range; a: Answer; onGoal: () => void }) {
  const asked = readView(new URLSearchParams(location.search)).funnel
  const steps = stepsOf(a, asked)
  const [res, setRes] = useState<FunnelResult[]>([])
  const [edit, setEdit] = useState(false)
  const [as, setAs] = useState<'step' | 'goal'>('step')
  const [page, setPage] = useState('')
  const key = JSON.stringify(steps)
  useEffect(() => {
    if (steps.length < 2) return
    let live = true
    void more.funnel(site.id, { from: range.from, to: range.to }, steps).then((r) => live && setRes(r.steps ?? []), () => live && setRes([]))
    return () => {
      live = false
    }
    // The steps are keyed by content.
  }, [site.id, range.from, range.to, key]) // eslint-disable-line react-hooks/exhaustive-deps
  const top = Math.max(1, res[0]?.visitors ?? 1)
  const goals = a.cur.goals ?? []
  const pages = (a.cur.dims.page ?? []).map((r) => r.value)
  const add = () => {
    if (!page) return
    if (as === 'goal') onGoal()
    else setView({ funnel: [...steps, { kind: 'page', value: page }] })
  }
  return (
    <>
      <XSec
        l={copy.funnel}
        r={
          edit ? null : (
            <button type="button" className="xb" onClick={() => setEdit(true)}>
              {copy.edit}
            </button>
          )
        }
      />
      {edit && (
        <div className="xedc">
          <div className="xedr">
            <select aria-label={copy.page} value={page} onChange={(e) => setPage(e.target.value)}>
              <option value="">{copy.choosePage}</option>
              {pages.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <XSub items={[{ id: 'step' as const, name: copy.step }, { id: 'goal' as const, name: copy.goal }]} cur={as} label={copy.addAs} onPick={setAs} />
            <button type="button" className="xb p" onClick={add}>
              {copy.add}
            </button>
          </div>
          {asked && asked.length > 0 && (
            <div className="xchips">
              {asked.map((s, i) => (
                <span key={s.kind + s.value} className="xchip2">
                  {s.kind === 'page' ? copy.step : copy.goal}: {name(s)}
                  <button type="button" aria-label={copy.removeStep(name(s))} onClick={() => setView({ funnel: asked.filter((_, j) => j !== i) })}>
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="xedf">
            <span>{copy.countsFrom}</span>
            <button type="button" className="xb" onClick={() => setEdit(false)}>
              {copy.done}
            </button>
          </div>
        </div>
      )}
      <div className="mf">
        {res.map((s) => (
          <div className="mfr" key={s.kind + s.value}>
            <span>{name(s, s.label)}</span>
            <div className="mb">
              <i style={{ width: `${Math.max(3, (s.visitors / top) * 100)}%` }} />
            </div>
            <b>{fmtInt(s.visitors)}</b>
          </div>
        ))}
      </div>
      <XSec l={copy.goals} r={copy.vsPreviousPeriod} />
      {goals.length === 0 ? (
        <SetupLock s={setupOf('goals', site, onGoal)} size="big" />
      ) : (
        goals.map((g) => {
          const was = a.prev?.goals?.find((x) => x.value === g.value)?.visitors ?? g.visitors
          return (
            <div className="mk-goal" key={g.value}>
              <span className="gn">{(g.label || g.value).replace(/^./, (c) => c.toUpperCase())}</span>
              <Rng v={g.visitors} lo={was * 0.75} hi={was * 1.25 + 1} max={Math.max(g.visitors, was * 1.25 + 1, 1) * 1.3} />
              <span className="gv">{fmtInt(g.visitors)}</span>
            </div>
          )
        })
      )}
    </>
  )
}
