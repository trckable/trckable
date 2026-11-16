// How many visitors are on the shared site now, for a link whose owner allows it: read on a modest beat, and not
// while the tab is hidden. A refused or failed read shows nothing.
import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export const ONLINE_EVERY = 30_000

export function useShareOnline(on: boolean): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!on) return
    let timer = 0
    let gone = false
    const read = () => {
      api
        .shareOnline()
        .then((r) => !gone && setN(Math.max(0, Math.floor(r.online))))
        .catch(() => !gone && setN(0))
    }
    const start = () => {
      window.clearInterval(timer)
      read()
      timer = window.setInterval(read, ONLINE_EVERY)
    }
    const watch = () => (document.visibilityState === 'visible' ? start() : window.clearInterval(timer))
    watch()
    document.addEventListener('visibilitychange', watch)
    return () => {
      gone = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', watch)
    }
  }, [on])
  return on ? n : 0
}
