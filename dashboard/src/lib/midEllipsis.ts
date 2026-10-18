/** A long name cut in the middle, so both its start and its end (the domain's ending) stay readable. */
export function midEllipsis(text: string, max: number): string {
  if (text.length <= max) return text
  const keep = max - 1
  const tail = Math.ceil(keep * 0.4)
  return text.slice(0, keep - tail) + '…' + text.slice(text.length - tail)
}
