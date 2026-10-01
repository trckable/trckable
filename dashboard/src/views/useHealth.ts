// The instance's health, read again every fifteen seconds while the tab is open.
import { useEffect, useState } from 'react'
import { api, type Health as H } from '../lib/api'
import { words } from '../lib/errors'

export function useHealth() {
  const [h, setH] = useState<H | null>(null)
  const [at, setAt] = useState<Date | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    const load = () => {
      api
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
