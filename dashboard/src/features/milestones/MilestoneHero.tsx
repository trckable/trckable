// The hero: the newest milestone as a big badge, or, before any, the nearest
// next one as "almost there".
import { Play, Share2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Milestone, MilestoneKind, MilestoneNext } from '../../lib/api'
import { fmtDay } from '../../lib/dates'
import { copy } from './copy'
import { ICON } from './icons'
import { goalLine, isMoney, leftLine, lineOf, ringPct, say, showsBig } from './words'

function Frame({ kind, label, kicker, children }: { kind: MilestoneKind; label: string; kicker: string; children: ReactNode }) {
  const I = ICON[kind]
  return (
    <section className={isMoney(kind) ? 'ms-hero money' : 'ms-hero'} aria-label={label}>
      <span className="ms-hero-badge" aria-hidden="true">
        <I size={60} strokeWidth={1.75} />
      </span>
      <div className="ms-hero-body">
        <span className="ms-kicker">{kicker}</span>
        {children}
      </div>
    </section>
  )
}

function Reached({ m, onShare, onReplay }: { m: Milestone; onShare: (m: Milestone) => void; onReplay: (m: Milestone) => void }) {
  const w = say(m)
  const big = showsBig(m) ? w.big : ''
  const unit = w.big && !big ? copy.revenueQuiet : w.label
  return (
    <Frame kind={m.kind} label={copy.newMilestone} kicker={`${copy.newMilestone} · ${fmtDay(m.day)}`}>
      <div className="ms-hero-big">
        {big && <b>{big}</b>}
        <span>{unit}</span>
      </div>
      <p>{lineOf(m)}</p>
      <div className="ms-hero-acts">
        <button type="button" className="btn primary" onClick={() => onShare(m)}>
          <Share2 size={15} strokeWidth={1.75} aria-hidden="true" />
          {copy.shareCard}
        </button>
        <button type="button" className="btn" onClick={() => onReplay(m)}>
          <Play size={14} strokeWidth={1.75} aria-hidden="true" />
          {copy.replayWay}
        </button>
      </div>
    </Frame>
  )
}

function Almost({ n }: { n: MilestoneNext }) {
  return (
    <Frame kind={n.kind} label={copy.almostThere} kicker={copy.almostThere}>
      <div className="ms-hero-big">
        <span>{goalLine(n)}</span>
      </div>
      <p>
        {leftLine(n)} · {ringPct(n)}%
      </p>
    </Frame>
  )
}

export function Hero({ m, next, onShare, onReplay }: { m: Milestone | null; next: MilestoneNext | null; onShare: (m: Milestone) => void; onReplay: (m: Milestone) => void }) {
  if (m) return <Reached m={m} onShare={onShare} onReplay={onReplay} />
  return next ? <Almost n={next} /> : null
}
