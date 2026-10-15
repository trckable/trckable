// Which markers the charts show: one setting for the main Visitors chart and
// the day-by-day chart alike. Kept in this browser (there are no account
// preferences to keep it in); a browser that will not store it uses the
// defaults and never throws.
import { useSyncExternalStore } from 'react'

export type Layer = 'sources' | 'links' | 'goals' | 'moments'
export const LAYERS: Layer[] = ['sources', 'links', 'goals', 'moments']

/** Sources, links and moments are on until turned off; goals are off until turned on. */
export const DEFAULT: Record<Layer, boolean> = { sources: true, links: true, goals: false, moments: true }

const KEY = 'trckable:markers'
const EVENT = 'trckable:markers'

let cached: { raw: string | null; held: number; value: Record<Layer, boolean> } | null = null
/** What was chosen in this page, so a browser that will not store it still obeys until the page closes. */
const held: Partial<Record<Layer, boolean>> = {}
let heldN = 0

function read(): Record<Layer, boolean> {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    /* storage blocked: the defaults */
  }
  if (cached && cached.raw === raw && cached.held === heldN) return cached.value
  let saved: Partial<Record<Layer, unknown>> = {}
  try {
    saved = raw ? (JSON.parse(raw) as typeof saved) : {}
  } catch {
    /* a damaged value is the defaults */
  }
  const value = { ...DEFAULT }
  for (const l of LAYERS) {
    const v = held[l] ?? saved[l]
    if (typeof v === 'boolean') value[l] = v
  }
  cached = { raw, held: heldN, value }
  return value
}

export function setLayer(layer: Layer, on: boolean) {
  held[layer] = on
  heldN++
  try {
    localStorage.setItem(KEY, JSON.stringify(read()))
  } catch {
    /* private mode: it holds until the page is closed */
  }
  window.dispatchEvent(new Event(EVENT))
}

const subscribe = (fn: () => void) => {
  window.addEventListener(EVENT, fn)
  window.addEventListener('storage', fn)
  return () => {
    window.removeEventListener(EVENT, fn)
    window.removeEventListener('storage', fn)
  }
}

export const useMarkers = (): Record<Layer, boolean> => useSyncExternalStore(subscribe, read, () => DEFAULT)
