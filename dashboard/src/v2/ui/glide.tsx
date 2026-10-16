// Numbers and lines that glide to the next period's values instead of jumping: a number counts to its new value, a line
// and the chart's points move to their new places. Each remembers what it last showed by a name, so it starts from there
// even when the page that held it was swapped for the next one.
import { useEffect, useRef, useState } from 'react'

const MS = 420
const shown = new Map<string, number[]>()

const still = () => typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
const ease = (t: number) => 1 - Math.pow(1 - t, 3)

/** A list read at n evenly spaced places, so two lists of different lengths can be mixed point by point. */
export function resample(a: number[], n: number): number[] {
  if (a.length === n || a.length === 0) return a.length === 0 ? Array.from({ length: n }, () => 0) : a
  if (a.length === 1) return Array.from({ length: n }, () => a[0])
  return Array.from({ length: n }, (_, i) => {
    const x = n === 1 ? 0 : (i / (n - 1)) * (a.length - 1)
    const k = Math.floor(x)
    return a[k] + ((a[Math.min(a.length - 1, k + 1)] - a[k]) * (x - k))
  })
}

/** The list on its way to `to`: it starts at what `name` last showed, drawn over `to`'s own places, and settles on `to`. */
export function useGlide(name: string, to: number[]): number[] {
  const key = to.join(',')
  const [frame, setFrame] = useState<number[]>(() => shown.get(name) ?? to)
  const now = useRef(frame)
  useEffect(() => {
    if (still()) {
      shown.set(name, to)
      now.current = to
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a person who asked for no motion gets the values at once
      setFrame(to)
      return
    }
    const n = to.length
    const a = resample(now.current, n)
    const b = to
    if (a.every((v, i) => v === b[i])) {
      shown.set(name, to)
      now.current = to
      setFrame(to)
      return
    }
    const t0 = performance.now()
    let id = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / MS)
      const f = k >= 1 ? to : a.map((v, i) => v + (b[i] - v) * ease(k))
      now.current = f
      setFrame(f)
      if (k < 1) id = requestAnimationFrame(step)
      else shown.set(name, to)
    }
    id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the list's contents
  }, [name, key])
  return frame
}

/** A number as written ("1,234", "$1.2k", "42%", "3.4 s"): the one run of digits in it, or null when it has none or several. */
const RUN = /^([^\d-]*)(-?\d[\d,]*)(\.\d+)?([^\d]*)$/

function parse(text: string): { pre: string; n: number; dec: number; comma: boolean; post: string } | null {
  const m = RUN.exec(text)
  if (!m) return null
  return { pre: m[1], n: Number((m[2] + (m[3] ?? '')).replace(/,/g, '')), dec: (m[3] ?? '').length - (m[3] ? 1 : 0), comma: m[2].includes(','), post: m[4] }
}

const write = (p: NonNullable<ReturnType<typeof parse>>, n: number): string => {
  const s = n.toLocaleString('en-US', { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec, useGrouping: p.comma })
  return `${p.pre}${s}${p.post}`
}

/** Text with a number in it, counting from what `name` last showed to the number now. Anything else is shown as it is. */
export function Glide({ name, text }: { name: string; text: string }) {
  const p = parse(text)
  const v = useGlide(`n:${name}`, p ? [p.n] : [])
  if (!p || v.length === 0) return <>{text}</>
  return <>{write(p, v[0])}</>
}
