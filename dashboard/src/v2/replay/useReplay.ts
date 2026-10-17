// The replay of the day: one run of about three seconds along the chart, and the moment it has reached for the bar's
// caption. Nothing else on the page changes while it plays. It can be stopped, and a click on Replay while it plays
// stops it too. With reduced motion there is no run: the day is a list of its moments, the chart as it is.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Moment } from './model'
import { reveal, runReveal } from './reveal'

export interface Replay {
  /** The bar is up (playing, or a moment's caption still on, or the list). */
  on: boolean
  playing: boolean
  cur: Moment | null
  reduced: boolean
  /** Starts the run; a second call while it plays starts it again from the left. */
  open: () => void
  /** Ends it where it is, and the chart is as it was. */
  close: () => void
  pick: (m: Moment) => void
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** The caption of the last moment stays this long after the line has reached the end. */
const LINGER_MS = 1600

export function useReplay(o: { moments: Moment[]; end: number }): Replay {
  const [on, setOn] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState<Moment | null>(null)
  const [rm, setRm] = useState(false)
  const live = useRef({ ...o, halt: undefined as (() => void) | undefined, linger: undefined as ReturnType<typeof setTimeout> | undefined })
  useEffect(() => {
    live.current = { ...live.current, ...o }
  })
  const close = useCallback(() => {
    clearTimeout(live.current.linger)
    live.current.halt?.()
    live.current.halt = undefined
    setPlaying(false)
    setOn(false)
    setCur(null)
  }, [])
  useEffect(() => {
    if (!playing) return
    // The moment the line is at: the last one at or before the minute it has reached.
    return reveal.subscribe(() => {
      const p = reveal.get()
      if (p < 0) return
      const { moments, end } = live.current
      const hit = moments.filter((m) => m.min <= p * end).pop() ?? null
      setCur((c) => (c === hit ? c : hit))
    })
  }, [playing])
  useEffect(() => {
    if (!on) return
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      e.preventDefault()
      close()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [on, close])
  useEffect(() => close, [close])
  const open = useCallback(() => {
    clearTimeout(live.current.linger)
    live.current.halt?.()
    const r = reduced()
    setRm(r)
    setOn(true)
    setCur(null)
    if (r) {
      setPlaying(false)
      return
    }
    setPlaying(true)
    live.current.halt = runReveal(0, () => {
      live.current.halt = undefined
      setPlaying(false)
      setCur(live.current.moments.at(-1) ?? null)
      live.current.linger = setTimeout(close, LINGER_MS)
    })
  }, [close])
  return { on, playing, cur, reduced: rm, open, close, pick: (m: Moment) => setCur(m) }
}
