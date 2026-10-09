// The overview of every site for a period (All sites): the rows, or why there are none.
// One read feeds the rows, the cards and the online counts, so they agree; it is read
// again every few seconds while the tab is shown, and when it is shown again.
import { useEffect, useState } from 'react'
import { feedOnline, holdOnline } from '../lib/allOnline'
import { type SiteRow, more } from '../lib/apiMore'
import { words } from '../lib/errors'

export const OVERVIEW_POLL_MS = 15_000

export function useOverview(days: number) {
  const [rows, setRows] = useState<SiteRow[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let ac = new AbortController()
    const read = (first: boolean) => {
      ac.abort()
      const mine = (ac = new AbortController())
      more
        .overview(days, mine.signal)
        .then((r) => {
          if (mine.signal.aborted) return
          setErr('')
          setRows(r.sites)
          feedOnline(r.sites)
        })
        // A later read that fails keeps the numbers on screen until the next one.
        .catch((e: unknown) => first && !mine.signal.aborted && setErr(words(e)))
    }
    const again = () => document.visibilityState === 'visible' && read(false)
    const release = holdOnline()
    read(true)
    const timer = setInterval(again, OVERVIEW_POLL_MS)
    document.addEventListener('visibilitychange', again)
    return () => {
      ac.abort()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', again)
      release()
    }
  }, [days])
  return { rows, err }
}
