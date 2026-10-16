// The four numbers: the dashboard's kept card, in the walkthrough's markup: an icon tile and a name, a quiet note on the
// right, one big number, and a smooth line with a soft glow, full-bleed to the card's bottom edge.
import { useId } from 'react'
import { Ico } from './icons'
import { spark } from '../briefing/geometry'

export interface Kc {
  key: string
  icon: string
  label: string
  val: string
  unit?: string
  note: { t: string; up?: boolean; dn?: boolean }
  vals: number[]
  lo?: number
  hi?: number
  /** The line's colour; red when the number is the bad kind of down. */
  col?: string
  dn?: boolean
}

export function Spark({ vals, h = 64, lo, hi, className = 'ksp' }: { vals: number[]; h?: number; lo?: number; hi?: number; className?: string }) {
  const id = useId()
  const s = spark(vals, h, lo ?? 0, hi)
  if (!s) return <svg className={className} viewBox={`0 0 300 ${h}`} preserveAspectRatio="none" aria-hidden="true" />
  return (
    <svg className={className} viewBox={`0 0 300 ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity=".32" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={s.area} fill={`url(#${id})`} />
      <path d={s.line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function Kcs({ items }: { items: Kc[] }) {
  return (
    <div className="kcs">
      {items.map((k) => (
        <div key={k.key} className={`kc${k.dn ? ' dn' : ''}`} data-k={k.key} style={{ color: k.dn ? 'var(--mk-red)' : (k.col ?? 'var(--mk-lime)') }}>
          <div className="kt">
            <span className="ki">
              <Ico name={k.icon} />
            </span>
            <span className="kl">{k.label}</span>
            <span className={`kn${k.note.up ? ' up' : ''}${k.note.dn ? ' dn' : ''}`}>{k.note.t}</span>
          </div>
          <div className="kv">
            {k.val}
            {k.unit && <small>{k.unit}</small>}
          </div>
          <Spark vals={k.vals} lo={k.lo} hi={k.hi} />
        </div>
      ))}
    </div>
  )
}
