// The chart's mention markers light up while the pointer is on the "Mentions · N" chip (and that chip's focus).
import { useSyncExternalStore } from 'react'

let on = false
const subs = new Set<() => void>()
export const setLit = (v: boolean) => {
  on = v
  subs.forEach((f) => f())
}
export const useLit = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => on,
    () => false,
  )
