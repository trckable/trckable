import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { reducedMotion } from '../../lib/motion'
import { ARRIVE_MS, arriveClass, arrivalsOf } from './arrivals'

/** The class each newly arrived row carries for a couple of seconds, counted from its own arrival: a busy site's later visits never keep
 * an earlier row marked. Nothing on the first look: only later visits arrive. */
export function useArrivals(keys: readonly string[]): Map<string, string> {
  const before = useRef<Set<string> | null>(null)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const [marks, setMarks] = useState<Map<string, string>>(() => new Map())
  const sig = keys.join('\n')
  useLayoutEffect(() => {
    const { fresh, batch } = arrivalsOf(before.current, keys)
    before.current = new Set(keys)
    if (!fresh.length) return
    const cls = arriveClass(batch, reducedMotion())
    setMarks((m) => new Map([...m, ...fresh.map((k): [string, string] => [k, cls])]))
    const t = setTimeout(() => {
      timers.current.delete(t)
      setMarks((m) => {
        const next = new Map(m)
        for (const k of fresh) if (next.get(k) === cls) next.delete(k)
        return next.size === m.size ? m : next
      })
    }, ARRIVE_MS)
    timers.current.add(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sig is keys' content
  }, [sig])
  useEffect(() => {
    const all = timers.current
    return () => all.forEach(clearTimeout)
  }, [])
  return marks
}
