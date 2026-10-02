// The queue behind SideCard, so only one is drawn at a time: the first to ask
// holds the slot, the others draw nothing until it is let go, and then the
// next in line takes it.
import { useEffect, useSyncExternalStore } from 'react'

let holder: string | null = null
const waiting: string[] = []
const subs = new Set<() => void>()
const tell = () => subs.forEach((f) => f())
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}

/** Whether the card with this id may be drawn now. */
export function useSideCard(id: string): boolean {
  const now = useSyncExternalStore(subscribe, () => holder, () => null)
  useEffect(() => {
    if (holder === null) holder = id
    else if (holder !== id && !waiting.includes(id)) waiting.push(id)
    tell()
    return () => {
      const i = waiting.indexOf(id)
      if (i >= 0) waiting.splice(i, 1)
      if (holder === id) holder = waiting.shift() ?? null
      tell()
    }
  }, [id])
  return now === id
}
