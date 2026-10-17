// What the bell does when something new arrives: the sale's chime (the same switch, signals/prefs) and a short wiggle, then
// again every half minute while anything is unread and the tab is in view. The sound is never the only sign: the count and
// the label say it too.
import { useEffect, useRef, useState } from 'react'
import { reducedMotion } from '../../lib/motion'
import { chime } from '../../features/signals/chime'
import { pref } from '../../features/signals/prefs'
import type { Notice } from './notices'

/** At most one sound in this many milliseconds, however many arrive. */
export const SOUND_GAP_MS = 5000
export const SHAKE_MS = 600
export const SHAKE_EVERY_MS = 30_000

/** The unread notices not seen before; null the first time a list is read (what is there then is not new). */
export function arrivals(known: Set<string> | null, items: Notice[], read: ReadonlySet<string>): Notice[] | null {
  if (known === null) return null
  return items.filter((n) => !n.seen && !read.has(n.id) && !known.has(n.id))
}

/** Whether a sound may play now, given when the last one did. */
export const soundDue = (last: number, now: number) => now - last >= SOUND_GAP_MS

/** Returns whether the bell is mid-wiggle. `ready`: the lists have been read (what is there when they first are is not new). */
export function useBellAlert(items: Notice[], read: ReadonlySet<string>, unread: number, open: boolean, ready: boolean): boolean {
  const [shaking, setShaking] = useState(false)
  const known = useRef<Set<string> | null>(null)
  const last = useRef(-Infinity)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const wiggle = () => {
    if (reducedMotion()) return
    setShaking(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setShaking(false), SHAKE_MS)
  }
  useEffect(() => {
    if (!ready) return
    const fresh = arrivals(known.current, items, read)
    known.current = new Set(items.map((n) => n.id))
    if (!fresh?.length) return
    const now = Date.now()
    if (pref('sound') && soundDue(last.current, now)) {
      last.current = now
      chime()
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new notice arriving is the trigger
    if (!open) wiggle()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new list is the only trigger
  }, [items, ready])
  useEffect(() => {
    if (unread <= 0 || open) {
      clearTimeout(timer.current)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- it stops the moment the bell is opened or nothing is unread
      setShaking(false)
      return
    }
    const id = setInterval(() => {
      if (!document.hidden) wiggle()
    }, SHAKE_EVERY_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wiggle only sets state and a timer
  }, [unread > 0, open])
  useEffect(() => () => clearTimeout(timer.current), [])
  return shaking
}
