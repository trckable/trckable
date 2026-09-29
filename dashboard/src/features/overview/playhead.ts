// Where the replay is right now, as a position between the chart's points
// (2.5 is halfway from the third to the fourth). The replay loop writes it
// every frame; the chart and the tiles read it and update themselves alone,
// so a frame never re-renders the page.
import { useSyncExternalStore } from 'react'

let pos = -1
const subs = new Set<() => void>()

export const playhead = {
  get: () => pos,
  set(p: number) {
    pos = p
    subs.forEach((f) => f())
  },
  subscribe(f: () => void) {
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  },
}

/** The position, re-rendering the caller each frame while `on`. */
export function usePlayhead(on: boolean): number {
  return useSyncExternalStore(
    (f) => (on ? playhead.subscribe(f) : () => {}),
    () => (on ? pos : -1),
  )
}
