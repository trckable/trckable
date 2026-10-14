import { areaPoints, sparkPoints } from './pageModel'
import { page } from './pageCopy'

const W = 360
const H = 120

/** The hours after a posting: visitors from the mention over everyone's, on one scale. */
export function DetailChart({ curve, usual, hours }: { curve: number[]; usual: number[]; hours: string[] }) {
  const top = Math.max(1, ...usual, ...curve)
  return (
    <figure className="mp-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={page.traffic} preserveAspectRatio="none">
        <polygon points={areaPoints(usual, W, H, 4, top)} className="mp-usual" />
        <polyline points={sparkPoints(curve, W, H, 4, top)} className="mp-line" />
      </svg>
      <figcaption>
        <span className="mp-key from">{page.fromIt}</span>
        <span className="mp-key usual">{page.usual}</span>
      </figcaption>
      <div className="mp-hours faint" aria-hidden="true">
        {hours.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
    </figure>
  )
}
