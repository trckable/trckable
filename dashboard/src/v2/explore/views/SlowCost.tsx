// What slow pages cost: one sentence with the month's loss, the method in a muted line, and the three speed bands.
import { fmtInt } from '../../../lib/format'
import { XCols, type CRow } from '../../ui/XTable'
import { copy } from '../slowCostCopy'
import type { XCtx } from '../ctx'
import type { SlowCostModel, SlowCostRow } from '../types'

const NONE = '–'

const names = { slow: [copy.bandSlow, copy.rangeSlow], mid: [copy.bandMid, copy.rangeMid], fast: [copy.bandFast, copy.rangeFast] } as const
const heads = { money: copy.rateMoney, goals: copy.rateGoals, engaged: copy.rateEngaged } as const
const says = {
  money: [copy.lostMoney, copy.lostMoneyMost],
  goals: [copy.lostGoals, copy.lostGoalsMost],
  engaged: [copy.lostEngaged, copy.lostEngagedMost],
} as const

export function SlowCost({ x, d }: { x: XCtx; d: SlowCostModel }) {
  if (d.verdict === 'few') return <p className="xslow-how">{copy.few}</p>
  const say = (n: number) => (d.kind === 'money' ? x.money(n) : fmtInt(n))
  const rows: CRow[] = d.rows.map((r: SlowCostRow) => ({
    key: r.band,
    a: (
      <>
        {names[r.band][0]}
        <small>{names[r.band][1]}</small>
      </>
    ),
    onPick: r.pages.length > 0 ? () => x.pickAny('page', r.pages) : undefined,
    c: [fmtInt(r.visits), r.rate === null ? NONE : `${Math.round(r.rate * 1000) / 10}%`, r.lost > 0 ? <span className="xqual-slow">{say(r.lost)}</span> : NONE],
  }))
  return (
    <>
      <p className="xchg-say">{says[d.kind][d.mostSlow ? 1 : 0](say(d.lost))}</p>
      <p className="xslow-how">{copy.method}</p>
      <XCols first={copy.loadTime} cols={[{ h: copy.visits }, { h: heads[d.kind] }, { h: copy.lost }]} rows={rows} xc="minmax(0,1fr) 64px 84px 84px" xcm="minmax(0,1fr) 52px 64px 64px" limit={3} onAll={x.showAll} />
    </>
  )
}
