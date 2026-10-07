// Two half rings. Gauge: a gradient fill and the share inside, for how far to
// a goal. ScoreKnob: a thicker ring with a knob at the end and a "/100".
import { useId, type ReactNode } from 'react'
import { Card } from './Card'
import { kitWords } from './copy'
import { clampPct, halfRing, ringPoint, toneColor, type Tone } from './model'

export function Gauge({ pct, label, caption, ariaLabel }: { pct: number; label?: ReactNode; caption?: ReactNode; ariaLabel?: string }) {
  const id = useId()
  const p = clampPct(pct)
  const d = halfRing(100, 104, 84)
  return (
    <span className="kit-gauge">
      <svg viewBox="0 0 200 112" role="img" aria-label={ariaLabel ?? kitWords.pct(Math.round(p))}>
        <defs>
          <linearGradient id={id} x1="0" x2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.45" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <path d={d} className="kit-gauge-bg" strokeWidth="16" />
        <path d={d} className="kit-gauge-fill" stroke={`url(#${id})`} strokeWidth="16" pathLength="100" strokeDasharray={`${p} 100`} />
      </svg>
      <span className="kit-gauge-n num">{label ?? kitWords.pct(Math.round(p))}</span>
      {caption && <span className="kit-sub">{caption}</span>}
    </span>
  )
}

export function ScoreKnob({ score, tone = 'good', title, sub, onOpen }: { score: number; tone?: Tone; title?: ReactNode; sub?: ReactNode; onOpen?: () => void }) {
  const s = Math.round(clampPct(score))
  const d = halfRing(110, 108, 92)
  const k = ringPoint(110, 108, 92, s)
  return (
    <Card title={title} onOpen={onOpen} className="kit-score">
      <span className="kit-val">
        <b className="num">{s}</b>
        <small>{kitWords.outOf}</small>
      </span>
      <svg viewBox="0 0 220 120" role="img" aria-label={kitWords.scoreOf(s)}>
        <path d={d} className="kit-gauge-bg" strokeWidth="22" />
        <path d={d} className="kit-gauge-fill" stroke={toneColor(tone)} strokeWidth="22" pathLength="100" strokeDasharray={`${s} 100`} />
        <circle cx={k.x} cy={k.y} r="13" className="kit-knob" />
      </svg>
      {sub && <span className="kit-sub mid">{sub}</span>}
    </Card>
  )
}
