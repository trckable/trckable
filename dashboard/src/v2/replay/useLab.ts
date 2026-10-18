// The replay lab's run: off, waiting for what it tells (on), playing, then the end state (end). One run of the shared
// clock (reveal.ts), longer than the plain replay's. Esc stops it. With reduced motion there is no run: the end state.
import { useCallback, useEffect, useRef, useState } from 'react'
import { LAB_MS } from './lab'
import { legsOf, runLegs } from './labRun'
import { runReveal } from './reveal'

export interface Lab {
  phase: 'off' | 'on' | 'end'
  /** The run is going (the button says Stop). */
  playing: boolean
  /** The moments are read: the run may begin. With the places of the moments along the line it rests on each; without, it is one sweep. */
  ready: (stops: number[] | null) => void
  start: () => void
  /** Ends it at once, on the end state. */
  skip: () => void
  /** Ends it, and the chart is as it was. */
  stop: () => void
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function useLab(key: string): Lab {
  const [phase, setPhase] = useState<Lab['phase']>('off')
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
    (stops: number[] | null) => {
      quit()
      const done = () => {
        halt.current = undefined
        setPhase('end')
      }
      halt.current = stops ? runLegs(legsOf(stops), done) : runReveal(0, done, LAB_MS)
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
