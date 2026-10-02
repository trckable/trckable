// Replay's clock and its racing arithmetic are one lazy chunk (replayEngine):
// the page loads without it and fetches it when a replay is about to start. The
// button asks for it as soon as it is pointed at, so by the time it is
// pressed the chunk is usually there.
import { useEffect, useState } from 'react'

export type Engine = typeof import('./replayEngine')

let loaded: Engine | null = null
let pending: Promise<Engine> | null = null

/** Starts fetching the engine (once), and says when it has arrived. */
export function loadReplay(): Promise<Engine> {
  pending ??= import('./replayEngine').then(
    (m) => (loaded = m),
    (e: unknown) => {
      pending = null // a failed fetch is asked for again next time
      throw e
    },
  )
  return pending
}

/** The engine once it has arrived, or null; `wanted` is what starts the fetch. */
export function useReplayEngine(wanted: boolean): Engine | null {
  const [engine, setEngine] = useState<Engine | null>(loaded)
  useEffect(() => {
    if (!wanted || engine) return
    let current = true
    loadReplay().then((m) => current && setEngine(m), () => {})
    return () => {
      current = false
    }
  }, [wanted, engine])
  return engine
}
