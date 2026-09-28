import { useEffect, useState } from 'react'

/**
 * The server's clock, moved on every second on this panel alone: the rows'
 * "5s" chips tick without the whole Live view re-rendering each second.
 * `skew` is the server's clock minus this browser's; never behind `clock`.
 */
export function useTicking(clock: number, skew: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return Math.max(clock, now + skew)
}
