// A 30-line animation engine: tween numbers and number arrays with rAF.
// No motion library; honours prefers-reduced-motion.
import { useEffect, useRef, useState } from 'react'

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const ease = (p: number) => 1 - Math.pow(1 - p, 3)

type Tweenable = number | number[]

function lerp<T extends Tweenable>(a: T, b: T, e: number): T {
  if (typeof a === 'number' && typeof b === 'number') return (a + (b - a) * e) as T
  const bb = b as number[]
  // A new period with a different length morphs from the old shape.
  const aa = (a as number[]).length === bb.length ? (a as number[]) : resample(a as number[], bb.length)
  return bb.map((v, i) => aa[i] + (v - aa[i]) * e) as T
}

export function useTween<T extends Tweenable>(target: T, ms = 520): T {
  const [value, setValue] = useState(target)
  const from = useRef(target)
  const cur = useRef(target)
  const raf = useRef(0)
  const key = typeof target === 'number' ? target : (target as number[]).join(',')
  useEffect(() => {
    cancelAnimationFrame(raf.current)
    from.current = cur.current
    if (reduced() || ms === 0) {
      cur.current = target
      setValue(target)
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms)
      cur.current = lerp(from.current, target, ease(p))
      setValue(cur.current)
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms])
  // Between a new target arriving and the effect above starting the tween,
  // there is one render that would hand back the old array. When the period
  // changes that array has the old length, and a chart plots thirty days of
  // values on a twenty-four-hour axis — for a frame, points off the edge and
  // bars off the top. The caller always gets the target's length.
  if (Array.isArray(target) && Array.isArray(value) && value.length !== target.length) {
    return resample(value as number[], (target as number[]).length) as T
  }
  return value
}

/** Resample to a fixed number of points so lines morph between periods. */
export function resample(vals: number[], n: number): number[] {
  if (vals.length === 0) return Array(n).fill(0)
  if (vals.length === 1) return Array(n).fill(vals[0])
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * (vals.length - 1)
    const lo = Math.floor(t),
      hi = Math.min(vals.length - 1, lo + 1)
    out[i] = vals[lo] + (vals[hi] - vals[lo]) * (t - lo)
  }
  return out
}
