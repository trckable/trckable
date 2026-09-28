// A chart's key: a swatch (or a line, for line charts) and a name per series.
export interface LegendItem {
  label: string
  color: string
  line?: boolean
  dashed?: boolean
}

export function Legend({ items }: { items: LegendItem[] }) {
  if (items.length === 0) return null
  return (
    <ul className="kit-legend">
      {items.map((it) => (
        <li key={it.label}>
          <i className={it.line ? 'line' : 'swatch'} style={it.line ? { borderColor: it.color, borderStyle: it.dashed ? 'dashed' : 'solid' } : { background: it.color }} aria-hidden="true" />
          {it.label}
        </li>
      ))}
    </ul>
  )
}
