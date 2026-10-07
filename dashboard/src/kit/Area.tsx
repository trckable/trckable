// A smooth line, drawn to the card's edges: just the shape, no axis, no fill. Decoration
// for the number above it, which carries the same story in words. With `was` a
// second, dashed line on the same scale (the same time a week ago).
import { areaPaths } from './model'
import './kit.css'

const W = 300
const H = 64

export function Area({ values, color, was, slots }: { values: number[]; color: string; was?: number[]; slots?: number }) {
    const both = was && was.length > 1 ? [...values, ...was] : values
  const scale = { min: was ? 0 : undefined, max: was ? Math.max(...both, 1) : undefined, slots }
  const { line } = areaPaths(values, W, H, 4, scale)
  const before = was && was.length > 1 ? areaPaths(was, W, H, 4, scale).line : ''
  return (
    <span className="kit-area" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {before && <path className="kit-was" d={before} fill="none" vectorEffect="non-scaling-stroke" />}
        <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  )
}
