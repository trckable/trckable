// The small self-drawing chart on a card: its line draws itself, its area fades
// in and the moment's dot pops (SideCard.css; none with reduced motion). The
// numbers are chartGeometry's; this only draws them, in the card's own tint.
import { geometry, CHART_H, CHART_W, type ChartSpec } from './chartGeometry'

export function Chart({ spec }: { spec: ChartSpec }) {
  const g = geometry(spec)
  if (!g) return null
  return (
    <svg className="side-chart" viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" aria-hidden="true">
      {g.base !== undefined && <line className="base" x1="0" x2={CHART_W} y1={g.base} y2={g.base} />}
      {g.goal !== undefined && <line className="base" x1="0" x2={CHART_W} y1={g.goal} y2={g.goal} />}
      {g.bars?.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="3" className={b.empty ? 'bar empty' : 'bar'} />
      ))}
      {g.line && <path className="ar" d={g.area} />}
      {g.line && <path className="ln" pathLength="1" d={g.line} vectorEffect="non-scaling-stroke" />}
      {g.point && <circle className="pt" cx={g.point[0]} cy={g.point[1]} r="3.5" vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}
