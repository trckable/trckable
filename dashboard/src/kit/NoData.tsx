// An empty series (nothing yet, or only zeros): a faint, fixed, gentle wave drawn
// like the real line, edge to edge, and a small glass pill that says so. The wave
// is decoration; the pill is the text. Not for a number that is "not counted".
import { kitWords } from './copy'
import './base.css'

/** A gentle curve that says nothing about any data. */
const WAVE = 'M0 38 C30 26 52 26 80 36 S130 50 160 38 S230 22 260 32 S292 40 300 36'

export function NoData({ className = '', height }: { className?: string; height?: number }) {
  return (
    <span className={`kit-area kit-nodata ${className}`.trim()} style={height ? { height } : undefined}>
      <svg viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden="true">
        <path d={WAVE} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="kit-nodata-pill">{kitWords.noData}</span>
    </span>
  )
}

/** Nothing to draw: no values, or all of them zero. */
export const isEmpty = (values: number[]) => values.every((v) => v === 0)
