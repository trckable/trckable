// The channel donut: one arc per row, sized by its share of the rows' total.
// The circle is drawn with a circumference of 100, so a dash length is a percent.

export interface Arc {
  key: string
  /** Length of the arc, in percent of the circle, less the gap. */
  length: number
  /** Where it starts, in percent of the circle. */
  offset: number
}

/** `gap` is the space between two arcs, in percent; a row too small to show still gets a dot. */
export function donutArcs(rows: { key: string; value: number }[], gap = 1.5): Arc[] {
  const total = rows.reduce((n, r) => n + Math.max(0, r.value), 0)
  if (total <= 0) return []
  let at = 0
  return rows
    .filter((r) => r.value > 0)
    .map((r) => {
      const share = (r.value / total) * 100
      const arc = { key: r.key, length: Math.max(0.1, share - gap), offset: at }
      at += share
      return arc
    })
}
