// How a number got from then to now: the old total, each cause stepping up or down from it, and the new total. The steps
// add up exactly, so the picture is the sum. A step opens what it stands for.
import { motion } from 'motion/react'

export interface Step {
  key: string
  label: string
  title?: string
  diff: number
  onPick?: () => void
}

/** The floating bars: where each step starts and ends, and the height everything is scaled to. */
export function waterfall(was: number, steps: { diff: number }[]) {
  let at = was
  const bars = steps.map((s) => {
    const from = at
    at += s.diff
    return { lo: Math.min(from, at), hi: Math.max(from, at) }
  })
  return { bars, end: at, top: Math.max(was, at, ...bars.map((b) => b.hi), 1) }
}

export function Waterfall({ was, wasLabel, nowLabel, steps, fmt }: { was: number; wasLabel: string; nowLabel: string; steps: Step[]; fmt: (n: number) => string }) {
  const { bars, end, top } = waterfall(was, steps)
  const pct = (n: number) => `${(n / top) * 100}%`
  const bar = (lo: number, hi: number, cls: string, i: number) => (
    <motion.i className={cls} style={{ bottom: pct(lo), height: `max(3px, ${pct(hi - lo)})`, originY: 1 }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.55, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }} />
  )
  return (
    <div className="wf" style={{ gridTemplateColumns: `repeat(${steps.length + 2},minmax(0,1fr))` }}>
      <div className="wf-c">
        <b>{fmt(was)}</b>
        <div className="wf-plot">{bar(0, was, 'total', 0)}</div>
        <span>{wasLabel}</span>
      </div>
      {steps.map((s, i) => (
        <button key={s.key} type="button" className="wf-c" title={s.title ?? s.label} disabled={!s.onPick} onClick={s.onPick}>
          <b className={s.diff < 0 ? 'dn' : 'up'}>{`${s.diff < 0 ? '−' : '+'}${fmt(Math.abs(s.diff))}`}</b>
          <div className="wf-plot">{bar(bars[i].lo, bars[i].hi, s.diff < 0 ? 'dn' : 'up', i + 1)}</div>
          <span>{s.label}</span>
        </button>
      ))}
      <div className="wf-c">
        <b>{fmt(end)}</b>
        <div className="wf-plot">{bar(0, end, 'total now', steps.length + 1)}</div>
        <span>{nowLabel}</span>
      </div>
    </div>
  )
}
