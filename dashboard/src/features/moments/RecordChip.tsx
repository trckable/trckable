// The busiest day of the last 90, as a star among the moment chips: same lane, a short tooltip on hover or focus. It sits on
// its day, a little aside when a chip is already there.
import { Star } from 'lucide-react'
import { useState } from 'react'
import type { Bucket } from '../../lib/api'
import { bucketOf } from '../notes/markers'
import { copy } from './copy'
import { aside, type ChartGeo } from './marks'

/** Where the star goes: its day's place on the lane, moved past any chip within a chip's width (to the side with room); null when the chart does not show the day. */
export function recordAt(day: string, labels: string[], bucket: Bucket, x: (i: number) => number, taken: number[]): number | null {
  const i = bucketOf(day, labels, bucket)
  if (i < 0) return null
  return aside(x(i), taken)
}

export function RecordChip({ g, record, at }: { g: ChartGeo; record: { day: string; people: number }; at: number | null }) {
  const [on, setOn] = useState(false)
  if (at === null) return null
  const line = copy.recordLine(record.people)
  return (
    <>
      <button type="button" className="moment-mark record" style={{ left: at, top: g.lane }} aria-label={line} onPointerEnter={() => setOn(true)} onPointerLeave={() => setOn(false)} onFocus={() => setOn(true)} onBlur={() => setOn(false)} onPointerDown={(e) => e.stopPropagation()}>
        <Star size={11} strokeWidth={2.25} aria-hidden="true" />
      </button>
      {on && (
        <div role="tooltip" className="moment-tip" style={{ left: Math.max(4, Math.min(at - 120, g.w - 244)), top: g.lane - 12, translate: '0 -100%', maxWidth: 240 }}>
          {line}
        </div>
      )}
    </>
  )
}
