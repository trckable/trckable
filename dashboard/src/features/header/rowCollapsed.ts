// Whether the period capsule is folded to its pill: this person's own choice
// on this device, so it lives in the browser (a browser that keeps nothing
// simply starts expanded each visit).
import { miniStore } from '../../lib/miniStore'

const KEY = 'trckable:row-collapsed'
/** How long the row's width takes to run (ControlRow.css), plus a breath. */
const MOVING_MS = 400

function read() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

const folded = miniStore(read())
export const useRowCollapsed = folded.use

// True while the width runs: the row clips its content only then, so the
// menus that hang under it are never cut off.
const moving = miniStore(false)
export const useRowMoving = moving.use
let settle = 0

export function toggleRowCollapsed() {
  folded.set(!folded.get())
  moving.set(true)
  clearTimeout(settle)
  settle = window.setTimeout(() => moving.set(false), MOVING_MS)
  try {
    localStorage.setItem(KEY, folded.get() ? '1' : '0')
  } catch {
    // Private mode: folded for this visit only.
  }
}
