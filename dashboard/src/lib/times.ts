/**
 * "How many times" as the server writes it (moments.Times): one decimal only
 * under ten, whole numbers from ten on, no trailing zero. 2.4×, 3×, 12×,
 * never 230.0×.
 */
export function times(f: number): string {
  const r = Math.round(f * 10) / 10
  return (r < 10 ? String(r) : String(Math.round(f))) + '×'
}
