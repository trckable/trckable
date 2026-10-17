import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { reducedMotion } from '../../lib/motion'
import { ARRIVE_MS, arriveClass, arrivalsOf } from './arrivals'

/** The class each newly arrived row carries for a couple of seconds. Nothing on the first look: only later visits arrive. */
export function useArrivals(keys: readonly string[]): Map<string, string> {
  const before = useRef<Set<string> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [marks, setMarks] = useState<Map<string, string>>(() => new Map())
  const sig = keys.join('\n')
  useLayoutEffect(() => {
    const { fresh, batch } = arrivalsOf(before.current, keys)
    before.current = new Set(keys)
    if (!fresh.length) return
    const cls = arriveClass(batch, reducedMotion())
    setMarks((m) => new Map([...m, ...fresh.map((k): [string, string] => [k, cls])]))
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMarks(new Map()), ARRIVE_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sig is keys' content
  }, [sig])
  useEffect(() => () => clearTimeout(timer.current), [])
  return marks
}
