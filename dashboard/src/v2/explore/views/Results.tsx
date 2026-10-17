// Goals & funnels: the funnel as bars with where people leave, the goals under it, and the card to change the funnel.
import { XEmpty, XSec, XSub } from '../../ui/XBits'
import { XGoals, XMiniFunnel } from '../../ui/XFunnel'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import { Lock } from './Lock'
import type { Funnel, Goal, Step } from '../types'

function Editor({ x, d }: { x: XCtx; d: Funnel }) {
  const { steps, goals } = x.custom
  return (
    <div className="xedc">
      <div className="xedr">
        <select id="xPg" aria-label={copy.heads.page} defaultValue={d.pages[0]?.name}>
          {d.pages.map((p) => (
            <option key={p.name}>{p.name}</option>
          ))}
        </select>
        <XSub
          label={copy.addAs}
          attr="xet"
          value={x.addAs}
          items={[
            { key: 'step', label: copy.step },
            { key: 'goal', label: copy.goal },
          ]}
          onPick={x.setAddAs}
        />
        <button
          type="button"
          className="xb p"
          id="xAdd"
          onClick={() => {
            const v = (document.getElementById('xPg') as HTMLSelectElement | null)?.value
            if (v) x.addCustom(v)
          }}
        >
          {copy.add}
        </button>
      </div>
      {steps.length + goals.length > 0 && (
        <div className="xchips">
          {steps.map((n, i) => (
            <span key={`s${n}`} className="xchip2">
              {copy.stepChip(n)}
              <button type="button" data-xdel={`s${i}`} aria-label={copy.removeStep(n)} onClick={() => x.removeCustom('step', i)}>
                {'×'}
              </button>
            </span>
          ))}
          {goals.map((n, i) => (
            <span key={`g${n}`} className="xchip2">
              {copy.goalChip(n)}
              <button type="button" data-xdel={`g${i}`} aria-label={copy.removeGoal(n)} onClick={() => x.removeCustom('goal', i)}>
                {'×'}
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="xedf">
        <span>{copy.countsFrom}</span>
        <button type="button" className="xb" id="xSaveF" onClick={() => x.setEdit(false)}>
          {copy.done}
        </button>
      </div>
    </div>
  )
}

export function Results({ x, d }: { x: XCtx; d: Funnel }) {
  const page = (n: string) => d.pages.find((p) => p.name === n)
  const steps: Step[] = [...d.steps, ...x.custom.steps.map((n) => ({ name: copy.viewed(n), v: page(n)?.v ?? 0, c: page(n)?.c ?? 0 }))]
  const own: Goal[] = x.custom.goals.map((n) => ({ ...(page(n) ?? { v: 0, c: 0, lo: 0, hi: 0, st: '' }), name: copy.visited(n) }))
  return (
    <>
      <div className="xsec">
        <span>{copy.funnel}</span>
        {!x.edit && (
          <button type="button" className="xb" id="xEdit" onClick={() => x.setEdit(true)}>
            {copy.edit}
          </button>
        )}
      </div>
      {x.edit && <Editor x={x} d={d} />}
      {steps.length >= 2 ? <XMiniFunnel steps={steps} leak={d.leak} ghost={d.ghost} onConnect={() => x.connect('rev')} /> : <XEmpty title={copy.emptyFunnel} hint={copy.emptyFunnelHint} />}
      <XSec a={copy.goals} b={d.vs} />
      {!d.goalsOn && <Lock k="goals" x={x} />}
      <XGoals goals={d.goalsOn ? [...d.goals, ...own] : []} />
      {d.goalsOn && (
        <button type="button" className="xb" id="xTrack" onClick={() => x.connect('goals')}>
          {copy.trackGoal}
        </button>
      )}
    </>
  )
}
