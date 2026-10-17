// Numbers and lines that glide to the next period's values instead of jumping: a number counts to its new value, a line
// and the chart's points move to their new places. Each remembers what it last showed by a name, so it starts from there
// even when the page that held it was swapped for the next one.
import { useEffect, useRef, useState } from 'react'
import { tag } from '../../i18n'

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

/** The language's own marks in a number: what groups thousands and what starts the decimals ("1.234,5" in German). */
export function marksOf(lang: string) {
  const parts = new Intl.NumberFormat(lang).formatToParts(1234.5)
  const at = (t: string, d: string) => parts.find((x) => x.type === t)?.value ?? d
  return { lang, group: at('group', ','), decimal: at('decimal', '.') }
}
type Marks = ReturnType<typeof marksOf>
const MARKS = marksOf(tag ?? 'en-US')
const esc = (c: string) => c.replace(/[\\^$.*+?()[\]{}|-]/g, '\\$&')

interface Parsed {
  pre: string
  n: number
  dec: number
  comma: boolean
  post: string
}

/** A number as written ("1,234", "$1.2k", "42%", "3.4 s", "3,4 s"): the one run of digits in it, or null when it has none or several. */
export function parse(text: string, k: Marks = MARKS): Parsed | null {
  const m = new RegExp(`^([^\\d-]*)(-?\\d[\\d${esc(k.group)}]*)(${esc(k.decimal)}\\d+)?([^\\d]*)$`).exec(text)
  if (!m) return null
  const decimals = m[3] ? m[3].slice(k.decimal.length) : ''
  return { pre: m[1], n: Number(m[2].split(k.group).join('') + (decimals ? '.' + decimals : '')), dec: decimals.length, comma: m[2].includes(k.group), post: m[4] }
}

export const write = (p: Parsed, n: number, k: Marks = MARKS): string => {
  const s = n.toLocaleString(k.lang, { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec, useGrouping: p.comma })
  return `${p.pre}${s}${p.post}`
}

/** Text with a number in it, counting from what `name` last showed to the number now. Anything else is shown as it is. */
export function Glide({ name, text }: { name: string; text: string }) {
  const p = parse(text)
  const v = useGlide(`n:${name}`, p ? [p.n] : [])
  if (!p || v.length === 0) return <>{text}</>
  return <>{write(p, v[0])}</>
}
