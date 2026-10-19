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

const FIRST = ['Calm', 'Brave', 'Quick', 'Quiet', 'Bright', 'Gentle', 'Lucky', 'Merry', 'Noble', 'Plucky', 'Proud', 'Sunny', 'Swift', 'Witty', 'Zesty', 'Cosy', 'Eager', 'Jolly', 'Kind', 'Lively', 'Mellow', 'Nimble', 'Polite', 'Steady']
const SECOND = ['Otter', 'Fox', 'Heron', 'Panda', 'Falcon', 'Koala', 'Lynx', 'Badger', 'Finch', 'Gecko', 'Hare', 'Ibis', 'Koi', 'Lemur', 'Marten', 'Newt', 'Owl', 'Puffin', 'Quail', 'Robin', 'Seal', 'Tern', 'Vole', 'Wren']

/** A friendly two-word name for an id ("Calm Otter"): chosen only by the id, so the same visitor has the same name everywhere. */
export function nameOf(id: string): string {
  const h = hueOf(id)
  let g = 2166136261
  for (let i = id.length - 1; i >= 0; i--) g = Math.imul(g ^ id.charCodeAt(i), 16777619)
  return `${FIRST[h % FIRST.length]} ${SECOND[(g >>> 0) % SECOND.length]}`
}

/** Shortens a long path in the middle, keeping where it starts and ends. */
export function truncateMiddle(text: string, max = 44): string {
  if (text.length <= max) return text
  const keep = max - 1
  const head = Math.ceil(keep / 2)
  const tail = Math.floor(keep / 2)
  return text.slice(0, head) + '…' + text.slice(text.length - tail)
}
