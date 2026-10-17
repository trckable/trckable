// Replay as a story for the periods that are not today (today has its own, moment by moment): the playhead walks the
// chart's points, the story's pops come as it passes them, and at the end a card sums the period up.
import { useCallback, useEffect, useRef, useState } from 'react'

export interface StoryReplay {
  phase: 'off' | 'on' | 'end'
  /** The point the playhead is on. */
  at: number | null
  playing: boolean
  start: () => void
  stop: () => void
  jump: (i: number) => void
}

/** The whole period takes about eight seconds, however many points it has. */
const stepMs = (n: number) => Math.max(90, Math.min(500, Math.round(8000 / Math.max(1, n))))

export function useStoryReplay(n: number): StoryReplay {
  const [phase, setPhase] = useState<'off' | 'on' | 'end'>('off')
  const [at, setAt] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const halt = useCallback(() => clearInterval(timer.current), [])
  // A different period (another number of points) ends it.
  const [forN, setForN] = useState(n)
  if (forN !== n) {
    setForN(n)
    setPhase('off')
    setAt(null)
  }
  useEffect(() => halt, [halt, n])
  const go = useCallback(
    (from: number) => {
      halt()
      setPhase('on')
      setAt(from)
      let i = from
      timer.current = setInterval(() => {
        i += 1
        if (i >= n) {
          halt()
          setPhase('end')
          setAt(null)
          return
        }
        setAt(i)
      }, stepMs(n))
    },
    [n, halt],
  )
  return {
    phase,
    at,
    playing: phase === 'on',
    start: () => go(0),
    stop: () => {
      halt()
      setPhase('off')
      setAt(null)
    },
    jump: (i) => go(i),
  }
}
