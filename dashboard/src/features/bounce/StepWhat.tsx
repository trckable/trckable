// Step 1: the big number, and the days it came from. A line of the daily share
// that leaves after one page, a band where it usually sits, and a marker on the
// day it left it.
import { fmtDay } from '../../lib/dates'
import { fmtPct } from '../../lib/format'
import type { BounceGuide } from '../../lib/apiMore'
import { copy } from './b'

const BAND = 0.1 // the guide calls a rate "usual" within this much of the usual

const at = (day: string) => Date.parse(day + 'T00:00:00Z')

function RateChart({ g }: { g: BounceGuide }) {
  const days = g.days
  if (days.length < 2) return null
  const t0 = at(days[0].day)
  const span = Math.max(1, at(days[days.length - 1].day) - t0)
  const x = (day: string) => ((at(day) - t0) / span) * 100
  const y = (r: number) => (1 - r) * 100
  const line = days.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(d.day).toFixed(2)} ${y(d.rate).toFixed(2)}`).join(' ')
  const top = Math.max(0, y(Math.min(1, g.usual + BAND)))
  const mark = g.since && days.some((d) => d.day === g.since) ? x(g.since) : null
  return (
    <figure className="bg-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={copy.chartLabel}>
        <rect className="band" x="0" y={top} width="100" height={y(Math.max(0, g.usual - BAND)) - top} />
        {mark !== null && <line className="mark" x1={mark} x2={mark} y1="0" y2="100" vectorEffect="non-scaling-stroke" />}
        <path className="ln" pathLength="1" d={line} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="bg-band-label" style={{ top: `${y(g.usual)}%` }}>
        {copy.usualBand(fmtPct(g.usual))}
      </span>
      {mark !== null && g.since && (
        <span className="bg-mark-label" style={{ left: `${mark}%` }}>
          {copy.since(fmtDay(g.since))}
        </span>
      )}
    </figure>
  )
}

export function StepWhat({ g }: { g: BounceGuide }) {
  return (
    <div className="bg-step bg-what">
      <header className="bg-hero">
        <b className="bg-rate">{fmtPct(g.rate)}</b>
        <span className="bg-leave">{copy.leave(fmtPct(g.usual))}</span>
      </header>
      <RateChart g={g} />
    </div>
  )
}
