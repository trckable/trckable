// The four numbers: the dashboard's kept card, in the walkthrough's markup: an icon tile and a name, a quiet note on the
// right, one big number, and a smooth line with a soft glow, full-bleed to the card's bottom edge.
import { useId, useState, type ReactNode } from 'react'
import type { Why } from '../briefing/why'
import { copy } from '../briefing/copy'
import { Ico } from './icons'
import { spark } from '../briefing/geometry'
import { Glide, useGlide } from './glide'

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
  /** Why the number moved, when it has: the note becomes a way to read it. */
  why?: Why
}

export function Spark({ vals, h = 64, lo, hi, className = 'ksp', name }: { vals: number[]; h?: number; lo?: number; hi?: number; className?: string; name?: string }) {
  const id = useId()
  const glided = useGlide(`s:${name ?? id}`, vals)
  const s = spark(name ? glided : vals, h, lo ?? 0, hi)
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

function Card({ k, h, foot }: { k: Kc; h?: number; foot?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const tone = `kn${k.note.up ? ' up' : ''}${k.note.dn ? ' dn' : ''}`
  return (
    <div className={`kc${k.dn ? ' dn' : ''}`} data-k={k.key} style={{ color: k.dn ? 'var(--mk-red)' : (k.col ?? 'var(--mk-lime)'), position: 'relative' }}>
      <div className="kt">
        <span className="ki">
          <Ico name={k.icon} />
        </span>
        <span className="kl">{k.label}</span>
        {k.why && k.note.t ? (
          <button type="button" className={tone} aria-expanded={open} title={copy.whyQ} onClick={() => setOpen((o) => !o)} style={{ cursor: 'pointer', padding: 0, position: 'relative', zIndex: 3 }}>
            {k.note.t}
          </button>
        ) : (
          <span className={tone}>{k.note.t}</span>
        )}
      </div>
      <div className="kv">
        <Glide name={k.key} text={k.val} />
        {k.unit && <small>{k.unit}</small>}
      </div>
      {foot}
      <Spark vals={k.vals} lo={k.lo} hi={k.hi} h={h} name={`kc:${k.key}`} />
      {open && k.why && (
        <div className="hw show" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2, background: 'var(--mk-card2)', padding: 'var(--mk-s3) var(--mk-s4)', borderRadius: '0 0 var(--mk-r) var(--mk-r)', color: 'var(--mk-muted)' }}>
          <b>{copy.whyDot}</b> {k.why.cause} <span className="ev">{k.why.todo}</span>
        </div>
      )}
    </div>
  )
}

/** `foot`: a quiet line under a card's number, by the card's key (the Visitors tile's pace). */
export function Kcs({ items, className = 'kcs', h, foot }: { items: Kc[]; className?: string; h?: number; foot?: Record<string, ReactNode> }) {
  return (
    <div className={className}>
      {items.map((k) => (
        <Card key={k.key} k={k} h={h} foot={foot?.[k.key]} />
      ))}
    </div>
  )
}
