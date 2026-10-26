// The replay's run: off, waiting for what it tells (on), playing, then the end state (end). One run of the shared clock
// (reveal.ts) that rests on each moment. Space pauses it, the right arrow goes to the next moment, Esc stops it. With
// reduced motion there is no run: the end state at once.
import { useCallback, useEffect, useRef, useState } from 'react'
import { legsOf, runLegs, type Run } from './run'

export interface Replay {
  phase: 'off' | 'on' | 'end'
  /** The run is going (the button says Stop). */
  playing: boolean
  /** The run waits where it is. */
  paused: boolean
  /** The moments are read: the run may begin. `stops` are their places along the line, from 0 to 1; with none it is one sweep. */
  ready: (stops: number[]) => void
  start: () => void
  /** Pauses the run, or sets it going again. */
  toggle: () => void
  /** Goes to the next moment; after the last one, to the end state. */
  next: () => void
  /** Ends it, and the chart is as it was. */
  stop: () => void
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** `visible` false (the page is behind another): a run does not play out of sight, it ends and the chart is as it was when the page is back. */
export function useReplay(key: string, visible = true): Replay {
  const [phase, setPhase] = useState<Replay['phase']>('off')
  const run = useRef<Run | undefined>(undefined)
  const [paused, setPaused] = useState(false)
  const quit = useCallback(() => {
    run.current?.stop()
    run.current = undefined
    setPaused(false)
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
      run.current = runLegs(legsOf(stops), () => {
        run.current = undefined
        setPaused(false)
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a run ends when its page goes out of sight, which is an outside change
    if (!visible && phase === 'on') stop()
  }, [visible, phase, stop])
  const toggle = useCallback(() => {
    const r = run.current
    if (!r) return
    if (paused) r.resume()
    else r.pause()
    setPaused(!paused)
  }, [paused])
  const next = useCallback(() => {
    run.current?.next()
  }, [])
  useEffect(() => {
    if (phase === 'off') return
    const onKey = (e: KeyboardEvent) => {
      const onButton = (e.target as HTMLElement | null)?.closest?.('button,a,input,textarea,select')
      if (e.key === ' ' && phase === 'on' && !onButton) toggle()
      else if (e.key === 'ArrowRight' && phase === 'on') next()
      else if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      if (e.key === ' ' || e.key === 'ArrowRight') e.preventDefault()
      else stop()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [phase, stop, toggle, next])
  return {
    phase,
    playing: phase === 'on',
    paused,
    ready,
    start: () => {
      quit()
      setPhase(reduced() ? 'end' : 'on')
    },
    toggle,
    next,
    stop,
  }
}
