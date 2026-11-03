// The smooth line with a soft glow under the four numbers, full-bleed to the card's bottom edge.
import { useId } from 'react'
import { spark } from '../briefing/geometry'
import { useGlide } from './glide'

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
