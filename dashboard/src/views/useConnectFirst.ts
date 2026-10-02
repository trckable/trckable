// A link from the Revenue tile names a provider: its connect step opens once,
// when the list of those not yet connected is in.
import { useEffect, useRef } from 'react'
import type { Provider } from '../lib/api'
import { settingsParam } from '../lib/settings'

export function useConnectFirst(available: Provider[], open: (p: Provider) => void) {
  const asked = useRef(false)
  useEffect(() => {
    if (asked.current || available.length === 0) return
    asked.current = true
    const want = settingsParam('connect')
    const p = available.find((x) => x.id === want)
    if (p) open(p)
  })
}
