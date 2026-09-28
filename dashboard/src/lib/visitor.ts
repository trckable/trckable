// Small helpers for showing one visitor, shared by Live's list and the
// journey dialog.

/** A stable colour for an id: the same visitor is always the same hue. */
export function hueOf(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 360
}

/** Shortens a long path in the middle, keeping where it starts and ends. */
export function truncateMiddle(text: string, max = 44): string {
  if (text.length <= max) return text
  const keep = max - 1
  const head = Math.ceil(keep / 2)
  const tail = Math.floor(keep / 2)
  return text.slice(0, head) + '…' + text.slice(text.length - tail)
}
