// The instance's health, read again every fifteen seconds while the tab is open.
import { useEffect, useState } from 'react'
import { type Health as H, more } from '../lib/apiMore'
import { words } from '../lib/errors'
import { visibleInterval } from '../lib/visibleInterval'

export function useHealth() {
  const [h, setH] = useState<H | null>(null)
  const [at, setAt] = useState<Date | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [round, setRound] = useState(0)
  useEffect(() => {
    const load = () => {
      more
        .health()
        .then((r) => {
          setH(r)
          setAt(new Date())
          setErr(null)
        })
        .catch((e: unknown) => setErr(words(e)))
    }
    load()
    return visibleInterval(load, 15_000)
  }, [round])
  return { h, at, err, retry: () => setRound((n) => n + 1) }
}
