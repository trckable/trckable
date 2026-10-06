// The prototype's gate. Off, nothing in Data changes. On (?glance=1 once, or
// localStorage.trckableGlance = '1'), Data keeps today's charts as the default
// and a quiet toggle reaches the Glance format. The choice is remembered per
// viewer and, when it is Glance, written into the address as ?fmt=glance.
import { miniStore } from '../../lib/miniStore'
import type { ViewState } from '../../lib/url'

const FLAG = 'trckableGlance'
const FORMAT = 'trckableGlanceFormat'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage can be blocked: the address still carries the choice */
  }
}

/** Whether the prototype is on. ?glance=1 turns it on and keeps it on; ?glance=0 turns it off. */
export function glanceOn(): boolean {
  const q = new URLSearchParams(location.search).get('glance')
  if (q === '1') write(FLAG, '1')
  if (q === '0') write(FLAG, null)
  return read(FLAG) === '1'
}

export type Format = 'charts' | 'glance'

/** The format on show: the address first, then what this viewer chose last, else Glance. */
export function formatOf(view: Pick<ViewState, 'fmt'>): Format {
  if (view.fmt) return view.fmt
  return read(FORMAT) === 'charts' ? 'charts' : 'glance'
}

/** Set by Glance while it is up: opens its search. The header's one search button shows only while this is set. */
export const searchOpen = miniStore<((from: HTMLElement | null) => void) | null>(null)

export const rememberFormat = (f: Format) => write(FORMAT, f)
