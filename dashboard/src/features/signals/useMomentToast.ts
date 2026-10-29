// A moment on the stream (a sale, a signup) told the one way: a toast over whatever view is open, the browser notice
// instead while the tab is out of sight, and a chime for one arriving when the person asked for a chime.
import { useEffect, useRef } from 'react'
import { toast } from '../../components/Toast'
import { chime } from './chime'
import { tell } from './notify'
import { pref } from './prefs'

/** At most this many toasts for one burst of moments: the rest are in the numbers. */
const BURST = 3

export interface Moment<T> {
  /** The stream's items that count, newest first, each with the id the stream gave it. */
  items: (T & { id: number })[]
  line: (item: T) => string
  /** The browser notice's tag: one for each moment, so a repeat replaces rather than stacks. */
  tag: (item: T) => string
  /** Whether it is arriving now and wants the chime. */
  loud: (item: T) => boolean
}

export function useMomentToast<T>({ items, line, tag, loud }: Moment<T>) {
  const last = useRef(0)
  useEffect(() => {
    const fresh = items.filter((s) => s.id > last.current)
    if (!fresh.length) return
    last.current = fresh[0].id
    fresh
      .slice(0, BURST)
      .reverse()
      .forEach((s) => {
        if (document.visibilityState === 'visible' && document.hasFocus()) toast(line(s), 'sale')
        else tell(line(s), '', tag(s))
      })
    if (pref('sound') && fresh.some(loud)) chime()
  }, [items, line, tag, loud])
}
