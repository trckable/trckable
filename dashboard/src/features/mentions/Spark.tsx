// A mention's visitors by hour as a small line. Decorative unless given a label.
import { areaPoints, sparkPoints } from './pageModel'

export function Spark({ values, w = 48, h = 18, label }: { values: number[]; w?: number; h?: number; label?: string }) {
  if (values.length < 2 || !values.some((n) => n > 0)) return null
  return (
    <svg className="mp-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <polygon points={areaPoints(values, w, h)} className="mp-spark-fill" />
      <polyline points={sparkPoints(values, w, h)} className="mp-spark-line" />
    </svg>
  )
}
