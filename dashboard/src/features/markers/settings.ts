// Whether the charts show the source markers: one setting for the main
// Visitors chart and the day-by-day chart alike. Kept in this browser (there are
// no account preferences to keep it in); a browser that will not store it uses
// the default (on) and never throws.
import { useSyncExternalStore } from 'react'

const KEY = 'trckable:markers'
const EVENT = 'trckable:markers'

/** What was chosen in this page, so a browser that will not store it still obeys until the page closes. */
let held: boolean | null = null

function read(): boolean {
  if (held !== null) return held
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setMarkers(on: boolean) {
  held = on
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* private mode: it holds until the page is closed */
  }
  window.dispatchEvent(new Event(EVENT))
}

const subscribe = (fn: () => void) => {
  window.addEventListener(EVENT, fn)
  return () => window.removeEventListener(EVENT, fn)
}

export const useMarkers = (): boolean => useSyncExternalStore(subscribe, read, () => true)

/** The setting now, for a menu that flips it. */
export const markersOn = read
