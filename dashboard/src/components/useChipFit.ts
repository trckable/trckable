// How many of a row's chips fit on its one line. The chips live in a box whose
// parent is the row; what is left of the row after its other children (the
// save icon, Views) is the room. The first render of a new set of chips draws
// them all and measures them before the browser paints; after that the widths
// are known, and the row's size changing only re-counts.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/** The "+N more" chip's width before it has been drawn once. */
const PLUS = 84

export function useChipFit(sig: string, count: number, off: boolean) {
  const box = useRef<HTMLDivElement>(null)
  const widths = useRef<number[]>([])
  const plus = useRef(PLUS)
  const [fit, setFit] = useState({ sig: '', n: count })
  const measuring = !off && fit.sig !== sig

  const fitTo = useCallback(() => {
    const el = box.current
    const row = el?.parentElement
    if (!el || !row || widths.current.length !== count) return
    const others = [...row.children].filter((c) => c !== el && (c as HTMLElement).offsetWidth > 0) as HTMLElement[]
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0
    const room = row.clientWidth - others.reduce((a, c) => a + c.offsetWidth + gap, 0) - gap
    const all = widths.current.reduce((a, w) => a + w, 0) + gap * (count - 1)
    let n = count
    if (all > room) {
      n = 0
      let used = plus.current
      for (const w of widths.current) {
        used += w + gap
        if (used > room) break
        n++
      }
    }
    setFit((f) => (f.sig === sig && f.n === n ? f : { sig, n }))
  }, [sig, count])

  useLayoutEffect(() => {
    const el = box.current
    if (!el || off) return
    if (measuring) widths.current = [...el.querySelectorAll<HTMLElement>('[data-chip]')].map((c) => c.offsetWidth)
    const more = el.querySelector<HTMLElement>('[data-more]')
    if (more && more.offsetWidth) plus.current = more.offsetWidth
    fitTo()
  }, [measuring, fit.n, fitTo, off])

  useEffect(() => {
    const row = box.current?.parentElement
    if (!row || off || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => fitTo())
    const watch = () => {
      ro.disconnect()
      ro.observe(row)
      for (const c of row.children) ro.observe(c)
    }
    // Views arrives after the first paint, in its own chunk.
    const mo = new MutationObserver(() => {
      watch()
      fitTo()
    })
    watch()
    mo.observe(row, { childList: true })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [fitTo, off])

  const n = measuring ? count : fit.n
  return { box, n: off ? 0 : n }
}
