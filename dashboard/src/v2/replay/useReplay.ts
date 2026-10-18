// The replay's run: off, waiting for what it tells (on), playing, then the end state (end). One run of the shared clock
// (reveal.ts) that rests on each moment. Esc stops it. With reduced motion there is no run: the end state at once.
import { useCallback, useEffect, useRef, useState } from 'react'
import { legsOf, runLegs } from './run'

export interface Replay {
  phase: 'off' | 'on' | 'end'
  /** The run is going (the button says Stop). */
  playing: boolean
  /** The moments are read: the run may begin. `stops` are their places along the line, from 0 to 1; with none it is one sweep. */
  ready: (stops: number[]) => void
  start: () => void
  /** Ends it at once, on the end state. */
  skip: () => void
  /** Ends it, and the chart is as it was. */
  stop: () => void
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function useReplay(key: string): Replay {
  const [phase, setPhase] = useState<Replay['phase']>('off')
  const halt = useRef<(() => void) | undefined>(undefined)
  const quit = useCallback(() => {
    halt.current?.()
    halt.current = undefined
  }, [])
  // Another period or site ends it.
  const [forKey, setForKey] = useState(key)
  if (forKey !== key) {
    setForKey(key)
    setPhase('off')
  }
  useEffect(() => quit, [quit, key])
  const ready = useCallback(
    (stops: number[]) => {
      quit()
      halt.current = runLegs(legsOf(stops), () => {
        halt.current = undefined
        setPhase('end')
      })
    },
    [quit],
  )
  const stop = useCallback(() => {
    quit()
    setPhase('off')
  }, [quit])
  useEffect(() => {
    if (phase === 'off') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      stop()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [phase, stop])
  return {
    phase,
    playing: phase === 'on',
    ready,
    start: () => {
      quit()
      setPhase(reduced() ? 'end' : 'on')
    },
    skip: () => {
      quit()
      setPhase('end')
    },
    stop,
  }
}
