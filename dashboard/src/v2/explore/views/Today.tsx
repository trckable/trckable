// The Briefing's first card: the one sentence that says what moved, the people and the sign-ups, whether the site was up, and the chart.
import { Suspense } from 'react'
import type { Report } from '../../../lib/api'
import { fmtInt, fmtPct } from '../../../lib/format'
import { plainSpan } from '../../../lib/plainSpan'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import type { Kc } from '../types'
import { BriefCard } from './BriefCard'
import { ChangedChart } from './chartChunk'

/** Whether the site was up: one small pill, red with the time lost when it was not, nothing where it is not watched. */
function Status({ lost, incidents }: { lost: number | null; incidents: number }) {
  if (lost === null) return null
  if (lost <= 0) return <span className="xbr-pill ok">{copy.siteOk}</span>
  return <span className="xbr-pill dn" title={copy.incidents(incidents)}>{copy.downFor(plainSpan(lost))}</span>
}

/** The chart's place: its height is held from the first paint, so the cards under it do not move when it arrives. */
function ChartSlot({ x, report, notes }: { x: XCtx; report: Report; notes: { day: string; text: string }[] }) {
  return (
    <div className="xchg-chart">
      <Suspense fallback={<i className="sk" />}>
        <ChangedChart x={x} report={report} notes={notes} />
      </Suspense>
    </div>
  )
}

/** Too little to compare: the one line that says why there is no comparison, and the one way to widen the period. */
function Plain({ x }: { x: XCtx }) {
  return (
    <>
      <p className="xchg-few">{copy.fewHere}</p>
      {x.widen && (
        <button type="button" className="xb" onClick={x.widen}>
          {copy.widen}
        </button>
      )}
    </>
  )
}

interface Props {
  x: XCtx
  say: string
  title: string
  people: Pick<Kc, 'val' | 'label'>
  /** How far people moved, written as the sentence writes it; none where the sentence gives no figure. */
  change: { text: string; tone: 'up' | 'dn' } | null
  /** People who signed up, where the site has a signup; with the people they are a share of. */
  signups?: { n: number; of: number }
  lost: number | null
  incidents: number
  report: Report
  chart: boolean
  notes: { day: string; text: string }[]
  plain: boolean
}

export function Today({ x, say, title, people, change, signups, lost, incidents, report, chart, notes, plain }: Props) {
  return (
    <BriefCard id="today" title={title}>
      <p className="xbr-say">{say}</p>
      <div className="xbr-nums">
        <div className="xbr-big" data-num="people">
          <b>{people.val}</b>
          <span>{people.label}</span>
          {change && <em className={change.tone}>{change.text}</em>}
        </div>
        {signups && (
          <div className="xbr-small" data-num="signups">
            <b>{fmtInt(signups.n)}</b>
            <span>{copy.signedUp}</span>
            {signups.of > 0 && <em>{`${fmtPct(signups.n / signups.of)} ${copy.ofPeople}`}</em>}
          </div>
        )}
        <Status lost={lost} incidents={incidents} />
      </div>
      {chart && <ChartSlot x={x} report={report} notes={notes} />}
      {plain && <Plain x={x} />}
    </BriefCard>
  )
}
