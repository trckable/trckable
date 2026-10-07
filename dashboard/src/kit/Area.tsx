// A soft tinted area under a smooth line, drawn to the card's edges. Decoration
// for the number above it, which carries the same story in words.
import { useId } from 'react'
import { areaPaths } from './model'
import './kit.css'

const W = 300
const H = 64

export function Area({ values, color }: { values: number[]; color: string }) {
  const id = useId()
  const { line, area } = areaPaths(values, W, H)
  return (
    <span className="kit-area" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  )
}
