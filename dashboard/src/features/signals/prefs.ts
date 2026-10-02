// What this browser keeps about the live extras. Per browser, not per account:
// a sound or a notice is about the machine in front of you. A browser that will
// not store them uses the defaults and never throws.
import { useEffect, useState } from 'react'

export type Pref = 'tab' | 'sound' | 'notify'

/** The count in the tab is on until it is turned off; the sound and the notices are off until they are turned on. */
const DEFAULT: Record<Pref, boolean> = { tab: true, sound: false, notify: false }
const EVENT = 'trckable:prefs'
const key = (p: Pref) => `trckable:pref:${p}`

export function pref(p: Pref): boolean {
  try {
    const v = localStorage.getItem(key(p))
    return v === null ? DEFAULT[p] : v === 'on'
  } catch {
    return DEFAULT[p]
  }
}

export function setPref(p: Pref, on: boolean) {
  try {
    localStorage.setItem(key(p), on ? 'on' : 'off')
  } catch {
    /* private mode: it holds until the page is closed */
  }
  window.dispatchEvent(new Event(EVENT))
}

/** A preference and the way to change it; every control that shows it hears the change. */
export function usePref(p: Pref): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => pref(p))
  useEffect(() => {
    const read = () => setOn(pref(p))
    window.addEventListener(EVENT, read)
    return () => window.removeEventListener(EVENT, read)
  }, [p])
  return [on, (next) => setPref(p, next)]
}
