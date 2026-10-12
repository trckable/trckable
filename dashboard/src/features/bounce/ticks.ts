// The fixes a person has ticked, kept in this browser only. A browser that
// refuses storage still ticks for the length of the visit.
import { useState } from 'react'

const key = (site: string) => `bounce-tried:${site}`

function read(site: string): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key(site)) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function useTicks(site: string): [string[], (k: string) => void] {
  const [ticked, setTicked] = useState(() => read(site))
  const toggle = (k: string) => {
    const next = ticked.includes(k) ? ticked.filter((x) => x !== k) : [...ticked, k]
    setTicked(next)
    try {
      localStorage.setItem(key(site), JSON.stringify(next))
    } catch {
      // storage is off: the tick lasts until the card closes
    }
  }
  return [ticked, toggle]
}
