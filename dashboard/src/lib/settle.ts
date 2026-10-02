// Work that only decorates (a row's sparkline, a site's icon, a chip's comparison,
// a card's picture) waits until the page has been still for a moment, so the
// first load asks for what the first screen needs and nothing else.
import { useEffect, useState } from 'react'

export const SETTLE_MS = 1500

/** Whether the page has had its moment: false at first, true a moment after it drew. */
export function useSettled(): boolean {
  const [done, setDone] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setDone(true), SETTLE_MS)
    return () => clearTimeout(t)
  }, [])
  return done
}
