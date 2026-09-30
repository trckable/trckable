// A value that components read with a hook and anything may set: for state that
// several parts of the page share without a parent to hold it.
import { useSyncExternalStore } from 'react'

export function miniStore<T>(first: T) {
  let value = first
  const subs = new Set<() => void>()
  const subscribe = (f: () => void) => {
    subs.add(f)
    return () => void subs.delete(f)
  }
  return {
    get: () => value,
    set: (next: T) => {
      if (next === value) return
      value = next
      subs.forEach((f) => f())
    },
    use: () => useSyncExternalStore(subscribe, () => value, () => value),
  }
}
