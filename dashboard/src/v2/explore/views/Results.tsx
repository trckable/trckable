// Goals & funnels: the funnel as bars with where people leave, the goals under it, and the card to change the funnel.
import { Plus } from 'lucide-react'
import { XSec } from '../../ui/XBits'
import { SuggestedGoal } from '../../goals/SuggestedGoal'
import { XGoals, XMiniFunnel } from '../../ui/XFunnel'
import { can } from '../../../lib/permissions'
import { lockCopy } from '../../ui/lockCopy'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import { FunnelEditor } from './FunnelEditor'
import { Lock } from './Lock'
import { SavedFunnels } from './SavedFunnels'
import type { Funnel, Goal, Step } from '../types'

export function Results({ x, d }: { x: XCtx; d: Funnel }) {
  const page = (n: string) => d.pages.find((p) => p.name === n)
  const steps: Step[] = [...d.steps, ...x.custom.steps.map((n) => ({ name: copy.viewed(n), v: page(n)?.v ?? 0, c: page(n)?.c ?? 0 }))]
  const own: Goal[] = x.custom.goals.map((n) => ({ ...(page(n) ?? { v: 0, c: 0, lo: 0, hi: 0, st: '' }), name: copy.visited(n) }))
  const leakStep = d.leak.at > 0 ? d.spec[d.leak.at] : undefined
  const leakPage = leakStep?.kind === 'page' ? leakStep.value : undefined
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
      <SavedFunnels site={x.site.id} spec={d.spec} />
      {x.edit && <FunnelEditor x={x} d={d} />}
      {steps.length >= 2 && steps[0].v > 0 ? <XMiniFunnel steps={steps} leak={d.leak} ghost={d.ghost} leakPage={leakPage} onLeak={leakPage ? () => x.goWith('pages', 'page', leakPage) : undefined} onConnect={can('payment.manage') ? () => x.connect('rev') : undefined} /> : (
        <div className="xfe">
          <span>{copy.emptyFunnel}</span>
          {can('funnel.create') ? (
            !x.edit && (
              <button type="button" className="xb" onClick={() => x.setEdit(true)}>
                <Plus aria-hidden="true" />
                {copy.addStep}
              </button>
            )
          ) : (
            <span className="mk-quiet">{lockCopy.ask}</span>
          )}
        </div>
      )}
      <XSec a={copy.goals} />
      {!d.goalsOn && <Lock k="goals" x={x} />}
      <XGoals goals={d.goalsOn ? [...d.goals, ...own] : []} />
      {d.goalsOn && <SuggestedGoal site={x.site} pages={d.pages.map((p) => p.name)} goals={d.goals.map((g) => ({ label: g.name, value: g.name, visitors: g.v }))} />}
      {d.goalsOn && can('goal.create') && (
        <button type="button" className="xb" id="xTrack" onClick={() => x.connect('goals')}>
          {copy.trackGoal}
        </button>
      )}
    </>
  )
}
