// Steps in order as bars whose length is the share of the first step, each
// with its count and the share of the step before it. Bars are rows, not
// shapes, so the chart reads the same at 375 px as on a wide screen.
import { useState } from 'react'
import { Tip } from './Tip'
import { useWidth } from './useWidth'

export interface FunnelBar {
  label: string
  value: number
  note?: string // "12.9% of the step before"
}

export function FunnelChart(p: { steps: FunnelBar[]; color: string; label: string; fmt: (n: number) => string; tip: (i: number) => string }) {
  const { ref, w } = useWidth<HTMLDivElement>()
  const [at, setAt] = useState<number | null>(null)
  const top = Math.max(1, p.steps[0]?.value ?? 1)
  return (
    <div ref={ref} className="kit-chart kit-funnel" role="img" aria-label={p.label} onPointerLeave={() => setAt(null)}>
      {p.steps.map((s, i) => (
        // Every number is written on the step itself, so the keyboard needs
        // no tooltip here; hovering still highlights the one you point at.
        <div key={s.label} className="kit-funnel-step" onPointerEnter={() => setAt(i)}>
          <div className="kit-funnel-label">
            <b>{s.label}</b>
            <span className="num">{p.fmt(s.value)}</span>
          </div>
          <div className="kit-funnel-track">
            <div className="kit-funnel-bar" style={{ width: `${Math.max(1.5, (s.value / top) * 100)}%`, background: p.color, opacity: at === null || at === i ? 1 : 0.55 }} />
          </div>
          {s.note && <span className="faint num kit-funnel-note">{s.note}</span>}
        </div>
      ))}
      <Tip width={w} at={at === null ? null : { x: w / 2, y: at * 58 + 30, body: <b className="num">{p.tip(at)}</b> }} />
    </div>
  )
}
