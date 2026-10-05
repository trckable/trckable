// The overview of every site for a period (All sites): the rows, or why there are none.
import { useEffect, useState } from 'react'
import { feedOnline } from '../lib/allOnline'
import { type SiteRow, more } from '../lib/apiMore'
import { words } from '../lib/errors'

export function useOverview(days: number) {
  const [rows, setRows] = useState<SiteRow[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    const ac = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new period starts a new fetch, so the last one's error goes
    setErr('')
    more
      .overview(days, ac.signal)
      .then((r) => {
        setRows(r.sites)
        feedOnline(r.sites)
      })
      .catch((e: unknown) => !ac.signal.aborted && setErr(words(e)))
    return () => ac.abort()
  }, [days])
  return { rows, err }
}
