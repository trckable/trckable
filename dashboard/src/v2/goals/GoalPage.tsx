// One goal's own page under Goals & sales: back to the list, its name, the numbers, why it stands out, and each time it happened.
import { ChevronLeft } from 'lucide-react'
import { Loading } from '../../components/loading/Loading'
import { XError } from '../ui/XBits'
import { setView } from '../../lib/url'
import type { XCtx } from '../explore/ctx'
import { GoalFacts, useGoalPage } from './GoalFacts'
import { QuietButton } from './QuietButton'
import { stand } from './standCopy'
import { nameOf } from './standing'

const back = () => setView({ xg: undefined })

export function GoalPage({ x, goal }: { x: XCtx; goal: string }) {
  const { from, to } = x.query
  const r = useGoalPage(x.site.id, goal, from, to)
  const backTo = (
    <button type="button" className="gp-back" onClick={back}>
      <ChevronLeft size={14} aria-hidden="true" />
      {stand.allGoals}
    </button>
  )
  if (r.state === 'loading') return <Loading height={240} label={stand.loading} />
  if (r.state === 'error')
    return (
      <>
        {backTo}
        <XError title={stand.gone} hint={r.message} onRetry={r.retry} />
      </>
    )
  const p = r.data
  return (
    <>
      {backTo}
      <div className="gp-head">
        <h2 title={nameOf(p.goal)}>{nameOf(p.goal)}</h2>
        <QuietButton key={goal} site={x.site.id} goal={goal} quiet={!!p.quiet} />
      </div>
      <GoalFacts page={p} zone={x.site.timezone} label={x.view.period === 'today' ? stand.tileToday : stand.tileReached} withDay={from !== to} wide />
    </>
  )
}
