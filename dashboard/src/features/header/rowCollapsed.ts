// Whether the period capsule is folded to its pill: this person's own choice
// on this device, so it lives in the browser (a browser that keeps nothing
// simply starts expanded each visit).
import { miniStore } from '../../lib/miniStore'

const KEY = 'trckable:row-collapsed'

function read() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

const folded = miniStore(read())
export const useRowCollapsed = folded.use

export function toggleRowCollapsed() {
  folded.set(!folded.get())
  try {
    localStorage.setItem(KEY, folded.get() ? '1' : '0')
  } catch {
    // Private mode: folded for this visit only.
  }
}
