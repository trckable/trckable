// The clock of the replay: it plays the day from midnight to now in twenty seconds, stops at each moment for a breath,
// and can be paused, dragged, sped up and closed. The page reads `t` (minutes into the day) as its "now".
import { useCallback, useEffect, useRef, useState } from 'react'
import { step, TICK_MS, type Moment } from './model'

export interface Replay {
  on: boolean
  t: number
  end: number
  speed: 1 | 2 | 4
  playing: boolean
  cur: Moment | null
  reduced: boolean
  open: () => void
  close: () => void
  toggle: () => void
  seek: (t: number) => void
  pick: (m: Moment) => void
  faster: () => void
}

const NEXT = { 1: 2, 2: 4, 4: 1 } as const

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function useReplay(o: { moments: Moment[]; end: number }): Replay {
  const [on, setOn] = useState(false)
  const [t, setT] = useState(0)
  const [speed, setSpeed] = useState<1 | 2 | 4>(1)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState<Moment | null>(null)
  const [rm, setRm] = useState(false)
  const live = useRef({ ...o, t, speed, dwell: 0, endT: undefined as ReturnType<typeof setTimeout> | undefined })
  useEffect(() => {
    live.current = { ...live.current, ...o, t, speed }
  })
  const stop = useCallback(() => {
    clearTimeout(live.current.endT)
    setPlaying(false)
  }, [])
  const close = useCallback(() => {
    stop()
    setOn(false)
    setCur(null)
  }, [stop])
  const seek = useCallback((to: number, play = false) => {
    const { moments, end, t: from } = live.current
    const next = Math.max(0, Math.min(end, to))
    setT(next)
    live.current.t = next
    const hit = moments.filter((m) => m.min <= next && (!play || m.min > from)).pop() ?? null
    if (play) {
      if (hit) {
        setCur(hit)
        live.current.dwell = 1900 / live.current.speed
      }
    } else setCur(hit)
  }, [])
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      const r = live.current
      if (r.dwell > 0) {
        r.dwell -= TICK_MS
        return
      }
      seek(r.t + step(r.end, r.speed), true)
      if (r.t >= r.end) {
        setPlaying(false)
        r.endT = setTimeout(close, 1800)
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [playing, seek, close])
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
  const open = useCallback(() => {
    const r = reduced()
    setRm(r)
    setOn(true)
    setCur(null)
    setSpeed(1)
    if (r) {
      setT(live.current.end)
      setPlaying(false)
    } else {
      setT(0)
      live.current.t = 0
      live.current.dwell = 0
      setPlaying(true)
    }
    window.scrollTo(0, 0)
  }, [])
  const toggle = useCallback(() => {
    clearTimeout(live.current.endT)
    if (playing) {
      setPlaying(false)
      return
    }
    if (live.current.t >= live.current.end - 1) {
      setT(0)
      live.current.t = 0
      setCur(null)
    }
    setPlaying(true)
  }, [playing])
  return {
    on,
    t,
    end: o.end,
    speed,
    playing,
    cur,
    reduced: rm,
    open,
    close,
    toggle,
    seek: (to: number) => {
      stop()
      live.current.dwell = 0
      seek(to)
    },
    pick: (m: Moment) => {
      setT(m.min)
      setCur(m)
    },
    faster: () => setSpeed((s) => NEXT[s]),
  }
}
