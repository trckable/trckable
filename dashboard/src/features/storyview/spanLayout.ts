// Where each moment's label goes on the chart: centred on its days, in the lane
// above the plot; two that would touch go one under the other if the line is
// low enough there, else the later one is left off (its band stays). Never over
// the line, never past the chart's edges. Pure: spanLayout.test.ts.
export interface LabelIn {
  id: string
  /** The middle of its days, in pixels. */
  center: number
  /** About how wide the label is. */
  width: number
  /** The line's highest point (smallest y) under its days. */
  peak: number
}

export interface LabelAt {
  id: string
  left: number
  top: number
}

export const LABEL_H = 26
const GAP = 6

export function layoutLabels(items: LabelIn[], chart: number, lane: number): LabelAt[] {
  const out: LabelAt[] = []
  const right = [-Infinity, -Infinity] // the last label's right edge, by row
  const tops = [Math.max(0, (lane - LABEL_H) / 2), lane + 2]
  for (const it of [...items].sort((a, b) => a.center - b.center)) {
    const left = Math.min(Math.max(it.center - it.width / 2, 0), Math.max(0, chart - it.width))
    // The lane has no line in it. A second row sits inside the plot, so it needs the line well under it.
    for (const row of [0, 1]) {
      const free = row === 0 || it.peak > tops[1] + LABEL_H + 4
      if (!free || left < right[row] + GAP) continue
      out.push({ id: it.id, left, top: tops[row] })
      right[row] = left + it.width
      break
    }
  }
  return out
}

/** About how wide a label is for its words: an icon, the words and the room around them. */
export const widthOf = (chars: number) => Math.round(40 + chars * 6.6)
