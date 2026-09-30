// The revenue under the main chart: chunky columns with rounded tops and the
// money colour lit from the top. The hovered day is drawn in full, the others
// a little softer; a day with no revenue draws nothing. Its own scale, never
// a second axis.
export const STRIP_H = 64
const MAX_BAR = STRIP_H - 16

export function RevenueStrip(p: { values: number[]; label: string; gradient: string; x: (i: number) => number; plotW: number; top: number; hover: number | null; clip: string; mask: string }) {
  const n = p.values.length
  // Scaled by the bars actually being drawn, not by where they are heading:
  // mid-tween the old period's tall bars would otherwise be divided by the
  // new period's small maximum and shoot out of the strip.
  const max = Math.max(1, ...p.values)
  const bw = Math.max(1.5, Math.min(18, (p.plotW / Math.max(1, n)) * 0.62))
  const base = p.top + STRIP_H - 4
  const r = Math.min(4, bw / 2)
  return (
    <g aria-hidden="true">
      <text x={0} y={p.top + 30} fontSize="11" fill="var(--text-3)">
        {p.label}
      </text>
      <g clipPath={`url(#${p.clip})`}>
        <g mask={`url(#${p.mask})`}>
          {p.values.map((v, i) => {
            if (!(v > 0)) return null
            const h = Math.max(2, Math.min(MAX_BAR, (v / max) * MAX_BAR))
            const l = p.x(i) - bw / 2
            const t = base - h
            const rr = Math.min(r, h)
            return <path key={i} d={`M${l} ${base}V${t + rr}Q${l} ${t} ${l + rr} ${t}H${l + bw - rr}Q${l + bw} ${t} ${l + bw} ${t + rr}V${base}Z`} fill={`url(#${p.gradient})`} fillOpacity={p.hover === i || p.hover == null ? 1 : 0.7} />
          })}
        </g>
      </g>
    </g>
  )
}
