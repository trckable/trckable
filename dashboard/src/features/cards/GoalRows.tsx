// The goals tab's rows: an icon for the kind of goal, its name in words, who
// reached it, and how well it converts. Under them, when the report knows how
// many visitors stayed past a bounce, the road from a visit to the first goal.
import { Download, SquareArrowOutUpRight, SquareCheckBig, TextCursorInput, type LucideIcon } from 'lucide-react'
import { StatusTag } from '../../kit'
import { fmtCompact, fmtInt, fmtPct } from '../../lib/format'
import { cardCopy } from './copy'
import type { CardsCtx } from './ctx'
import { engagedOf, goalFunnel, goalKind, goalStatus, type FunnelStep, type GoalKind } from './goalModel'

const ICON: Record<GoalKind, LucideIcon> = { outbound: SquareArrowOutUpRight, download: Download, form: TextCursorInput, custom: SquareCheckBig }

const KNOWN: Record<string, () => string> = {
  outbound: () => cardCopy.goalOutbound,
  download: () => cardCopy.goalDownload,
  form: () => cardCopy.goalForm,
}

/** The name in words for the goals the tracker counts itself; a goal someone named reads as typed. */
const nameOf = (value: string) => KNOWN[goalKind(value)]?.() ?? value

const STEP: Record<FunnelStep['key'], (goal: string) => string> = {
  visitors: () => cardCopy.funnelVisitors,
  engaged: () => cardCopy.funnelEngaged,
  goal: (goal) => goal,
}

export function GoalRows({ c }: { c: CardsCtx }) {
  const rows = c.scrubbing ? [] : c.goals.slice(0, c.rows)
  const top = rows[0]
  const steps = top ? goalFunnel(c.visitors, engagedOf(c.visitors, c.cur?.kpis.bounce_rate), top.visitors) : null
  return (
    <div className="goals">
      {rows.map((r) => {
        const Icon = ICON[goalKind(r.value)]
        const conv = c.visitors ? r.visitors / c.visitors : 0
        const status = goalStatus(conv)
        return (
          <button key={r.value} type="button" className="goal" title={r.value} aria-label={`${r.value}: ${fmtInt(r.visitors)}. Filter by this`} onClick={() => c.addFilter('goal', r.value)}>
            <span className="goal-ic" aria-hidden="true">
              <Icon size={16} />
            </span>
            <span className="goal-name">
              <b>{nameOf(r.value)}</b>
              <small>{cardCopy.goalVisitors(r.visitors)}</small>
            </span>
            <span className="goal-conv">
              <b className="num">{fmtPct(conv)}</b>
              <StatusTag tone={status === 'converting' ? 'good' : 'warn'}>{status === 'converting' ? cardCopy.converting : cardCopy.barelyUsed}</StatusTag>
            </span>
          </button>
        )
      })}
      {top && steps && (
        <div className="goal-funnel">
          <div className="goal-funnel-title">{cardCopy.funnelTitle}</div>
          {steps.map((s) => (
            <div key={s.key} className="goal-step">
              <span className="goal-step-name">{STEP[s.key](nameOf(top.value))}</span>
              <span className="kit-rowbar" aria-hidden="true">
                <i style={{ width: `${s.width}%` }} />
              </span>
              <span className="num">{fmtCompact(s.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
