// Where a popover goes: under its button when it fits there, else above it,
// else over it. Below it hangs from `top`, above it stands on `bottom`, so a
// list that grows while it is open (a site added elsewhere) grows away from the
// button; `room` is the most height it may take before its list scrolls.
export type PopAt = { left: number; top?: number; bottom?: number; room: number }

const GAP = 6
const EDGE = 8

export function placePop(btn: { top: number; bottom: number; right: number }, pop: { w: number; h: number }, view: { w: number; h: number }): PopAt {
  const left = Math.max(EDGE, Math.min(btn.right - pop.w, view.w - pop.w - EDGE))
  const below = view.h - btn.bottom - GAP - EDGE
  const above = btn.top - GAP - EDGE
  // A button scrolled out of sight (a key opened this) still leaves the panel inside the window.
  if (below >= pop.h + GAP + EDGE) return { left, top: Math.max(EDGE, btn.bottom + GAP), room: below }
  if (above >= pop.h) return { left, bottom: view.h - btn.top + GAP, room: above }
  // Neither side has room: over the button, from the top of the window.
  return { left, top: EDGE, room: view.h - 2 * EDGE }
}
