// The small legend the gap and stacked models carry, right-aligned at the top
// of the plot: a swatch (or a dash) and a word, each.
interface Item {
  label: string
  color: string
  dash?: boolean
}

const CHAR = 6.4
const SWATCH = 18
const GAP = 10

/** Right-aligned; what does not fit between `left` and `right` is left out, from the start. */
export function ModelLegend({ items: all, left, right, top }: { items: Item[]; left: number; right: number; top: number }) {
  const size = (it: Item) => SWATCH + GAP + it.label.length * CHAR
  let items = all
  while (items.length > 1 && items.reduce((sum, it) => sum + size(it), 0) > right - left) items = items.slice(1)
  const widths = items.map(size)
  const starts = widths.map((_, i) => right - widths.slice(i).reduce((sum, v) => sum + v, 0))
  return (
    <g aria-hidden="true" className="model-legend">
      {items.map((it, i) => (
        <g key={it.label} transform={`translate(${starts[i]} ${top})`}>
          {it.dash ? <line x1={0} x2={11} y1={0} y2={0} stroke={it.color} strokeWidth="1.5" strokeDasharray="3 2" /> : <rect x={0} y={-4} width={8} height={8} rx={2} fill={it.color} />}
          <text x={15} y={3.5} fontSize="11" fill="var(--text-3)">
            {it.label}
          </text>
        </g>
      ))}
    </g>
  )
}
