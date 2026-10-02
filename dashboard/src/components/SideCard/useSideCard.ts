// The queue behind SideCard, so only one is drawn at a time: the first to ask
// holds the slot, the others draw nothing until it is let go, and then the
// next in line takes it. A card someone asked for (a click) is urgent: it takes
// the slot from one that came up on its own, which waits at the head of the
// line and comes back when the asked-for card is gone.
import { useEffect, useSyncExternalStore } from 'react'

let holder: string | null = null
const waiting: string[] = []
const urgent = new Set<string>()
const subs = new Set<() => void>()
const tell = () => subs.forEach((f) => f())
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}

/** Whether the card with this id may be drawn now. */
export function useSideCard(id: string, asked = false): boolean {
  const now = useSyncExternalStore(subscribe, () => holder, () => null)
  useEffect(() => {
    if (asked) urgent.add(id)
    if (holder === null) holder = id
    else if (holder !== id && asked && !urgent.has(holder)) {
      waiting.unshift(holder)
      holder = id
    } else if (holder !== id && !waiting.includes(id)) waiting.push(id)
    tell()
    return () => {
      urgent.delete(id)
      const i = waiting.indexOf(id)
      if (i >= 0) waiting.splice(i, 1)
      if (holder === id) holder = waiting.shift() ?? null
      tell()
    }
  }, [id, asked])
  return now === id
}
