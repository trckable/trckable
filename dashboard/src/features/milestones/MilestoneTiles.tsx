// The tiles under the hero: a gauge for each next step, a badge for
// each one reached.
import { Check, Play } from 'lucide-react'
import type { Milestone, MilestoneNext } from '../../lib/api'
import { fmtDay } from '../../lib/dates'
import { Gauge } from '../../kit/Gauge'
import { copy } from './copy'
import { ICON } from './icons'
import { badge, goalLine, isMoney, isQuietStep, leftLine, progressLine, ringPct, tileLabel } from './words'

export function NextTile({ n, i }: { n: MilestoneNext; i: number }) {
  const pct = ringPct(n)
  return (
    <li className="ms-tile ms-next" style={{ '--i': i } as React.CSSProperties}>
      <Gauge pct={pct} />
      <b>{goalLine(n)}</b>
      <span className="ms-left">{leftLine(n)}</span>
      <span className="ms-pace">{progressLine(n)}</span>
    </li>
  )
}

export function DoneTile({ m, i, revenue, onReplay, onShare }: { m: Milestone; revenue: boolean; i: number; onReplay: () => void; onShare: () => void }) {
  const label = tileLabel(m, revenue)
  const I = ICON[m.kind]
  const quiet = isQuietStep(m)
  return (
    <li className={isMoney(m.kind) ? 'ms-tile ms-done money' : 'ms-tile ms-done'} style={{ '--i': i } as React.CSSProperties}>
      <span className="ms-badge">{quiet ? <Check size={22} strokeWidth={1.75} aria-label={copy.quietStep} /> : badge(m, revenue) || <I size={22} strokeWidth={1.75} aria-hidden="true" />}</span>
      <b>{label}</b>
      <span className="ms-when">{fmtDay(m.day)}</span>
      <span className="ms-acts">
        <button type="button" className="btn" aria-label={copy.replayOf(label)} onClick={onReplay}>
          <Play size={13} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button type="button" className="btn" aria-label={copy.shareOf(label)} onClick={onShare}>
          {copy.share}
        </button>
      </span>
    </li>
  )
}
