// The instance's health, read again every fifteen seconds while the tab is open.
import { useEffect, useState } from 'react'
import { type Health as H, more } from '../lib/apiMore'
import { words } from '../lib/errors'

export function useHealth() {
  const [h, setH] = useState<H | null>(null)
  const [at, setAt] = useState<Date | null>(null)
  const [err, setErr] = useState<string | null>(null)
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
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [])
  return { h, at, err }
}
