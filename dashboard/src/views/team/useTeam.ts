// The team read: every site's day, asked again every few seconds while the tab is shown. A read that fails after the first keeps the
// numbers on screen until the next one.
import { useEffect, useState } from 'react'
import { more, type TeamRow } from '../../lib/apiMore'
import { words } from '../../lib/errors'
import { visibleInterval } from '../../lib/visibleInterval'

export const TEAM_POLL_MS = 15_000

export function useTeam(): { rows: TeamRow[] | null; err: string } {
  const [rows, setRows] = useState<TeamRow[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let ac = new AbortController()
    const read = (first: boolean) => {
      ac.abort()
      const mine = (ac = new AbortController())
      more
        .team(mine.signal)
        .then((r) => {
          if (mine.signal.aborted) return
          setErr('')
          setRows(r.sites)
        })
        .catch((e: unknown) => first && !mine.signal.aborted && setErr(words(e)))
    }
    read(true)
    const stop = visibleInterval(() => read(false), TEAM_POLL_MS)
    return () => {
      ac.abort()
      stop()
    }
  }, [])
  return { rows, err }
}
