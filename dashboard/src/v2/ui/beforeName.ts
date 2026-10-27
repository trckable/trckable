/** Where the name of the period before is written: at the end of its dashed line, above it or, when a line or the live dot is in the way there, below it; none when neither side is clear (the legend and the hover name it). Never over a line. */
export function beforeName(chars: number, dashed: number[][], line: number[][], right: number): { x: number; y: number } | null {
  const end = dashed[dashed.length - 1]
  if (!end || !chars) return null
  const x1 = Math.min(end[0], right)
  const x0 = x1 - chars * 7 - 4
  const busy = (y0: number, y1: number) => [...line, ...dashed.slice(0, -1)].some(([x, y]) => x >= x0 && x <= x1 + 6 && y >= y0 && y <= y1)
  if (!busy(end[1] - 22, end[1] - 3)) return { x: x1, y: end[1] - 7 }
  if (!busy(end[1] + 3, end[1] + 22)) return { x: x1, y: end[1] + 17 }
  return null
}

