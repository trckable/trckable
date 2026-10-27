// A figure that counts up to itself once when its card comes in. A figure with grouping, a decimal or no digits only
// is shown as it is, and so is every figure for someone who asked for less motion.
import { useEffect, useState } from 'react'

const PLAIN = /^([^\d]*)(\d{1,9})([^\d]*)$/
const MS = 800

const still = (): boolean => typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches

export function CountUp({ text }: { text: string }) {
  const [shown, setShown] = useState(text)
  useEffect(() => {
    const m = PLAIN.exec(text)
    if (!m || still()) return
    const to = Number(m[2])
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / MS)
      setShown(`${m[1]}${Math.round(to * (1 - (1 - p) ** 3))}${m[3]}`)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text])
  return <>{shown}</>
}
