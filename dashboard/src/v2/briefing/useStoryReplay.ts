// Replay as a story for the periods that are not today (today has its own, moment by moment): one run along the
// chart, about three seconds, with the story's pops coming as the line passes them, and at the end a card that sums
// the period up. The run waits for the story's moments to be read, so nothing is fetched while it plays. With reduced
// motion there is no run: the card is there at once.
import { useCallback, useEffect, useRef, useState } from 'react'
import { runReveal } from '../replay/reveal'

export interface StoryReplay {
  phase: 'off' | 'on' | 'end'
  playing: boolean
  /** The story has its moments (or has none to wait for): the run may begin. */
  ready: () => void
  start: () => void
  stop: () => void
  jump: (i: number) => void
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function useStoryReplay(n: number): StoryReplay {
  const [phase, setPhase] = useState<'off' | 'on' | 'end'>('off')
  const halt = useRef<(() => void) | undefined>(undefined)
  const from = useRef(0)
  const quit = useCallback(() => {
    halt.current?.()
    halt.current = undefined
  }, [])
  // A different period (another number of points) ends it.
  const [forN, setForN] = useState(n)
  if (forN !== n) {
    setForN(n)
    setPhase('off')
  }
  useEffect(() => quit, [quit, n])
  const run = useCallback(() => {
    quit()
    halt.current = runReveal(from.current, () => {
      halt.current = undefined
      setPhase('end')
    })
  }, [quit])
  return {
    phase,
    playing: phase === 'on',
    // The story mounts when the phase is on and calls this once it has what it needs.
    ready: run,
    start: () => {
      quit()
      from.current = 0
      setPhase(reduced() ? 'end' : 'on')
    },
    stop: () => {
      quit()
      setPhase('off')
    },
    jump: (i) => {
      from.current = n > 1 ? i / (n - 1) : 0
      run()
    },
  }
}
