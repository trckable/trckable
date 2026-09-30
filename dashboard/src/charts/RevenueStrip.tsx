// The revenue under the main chart: slim bars with rounded tops in the money
// colour, calm until one day is hovered, which is drawn in full. A day with no
// revenue draws nothing. Its own scale, never a second axis.
export const STRIP_H = 44
const MAX_BAR = STRIP_H - 12

export function RevenueStrip(p: { values: number[]; label: string; x: (i: number) => number; plotW: number; top: number; hover: number | null; clip: string; mask: string }) {
  const n = p.values.length
  const max = Math.max(1, ...p.values)
  const bw = Math.max(1.5, Math.min(4.5, (p.plotW / Math.max(1, n)) * 0.5))
  const base = p.top + STRIP_H - 4
  return (
    <g aria-hidden="true">
      <text x={0} y={base - 6} fontSize="9.5" fill="var(--text-4)">
        {p.label}
      </text>
      <g clipPath={`url(#${p.clip})`}>
        <g mask={`url(#${p.mask})`}>
          {p.values.map((v, i) => {
            if (!(v > 0)) return null
            const h = Math.max(bw, (v / max) * MAX_BAR)
            const r = bw / 2
            const l = p.x(i) - r
            const t = base - h
            return <path key={i} d={`M${l} ${base}V${t + r}Q${l} ${t} ${l + r} ${t}Q${l + bw} ${t} ${l + bw} ${t + r}V${base}Z`} fill="var(--money)" fillOpacity={p.hover === i ? 1 : 0.55} />
          })}
        </g>
      </g>
    </g>
  )
}
