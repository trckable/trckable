import { useState } from 'react'

type Held<T> = { scope: string; value: T } | null

/** What stays on screen: the new value when there is one, else the one held
 *  before, unless it was held for another scope (another site, another page),
 *  so one site's numbers are never kept up for another's. */
export function keep<T>(held: Held<T>, value: T | null | undefined, scope: string): { held: Held<T>; shown: T | null | undefined } {
  if (value != null) return { held: { scope, value }, shown: value }
  const same = held && held.scope === scope ? held : null
  return { held: same, shown: same ? same.value : value }
}

/** The last value that was there: while the next one is on its way (null or
 *  undefined) the view keeps showing the previous, never an empty hole. */
export function useKept<T>(value: T | null | undefined, scope = ''): T | null | undefined {
  const [held, setHeld] = useState<Held<T>>(null)
  const next = keep(held, value, scope)
  // Held in state and settled during the render itself: the next render already has it.
  if (next.held?.value !== held?.value || next.held?.scope !== held?.scope) setHeld(next.held)
  return next.shown
}
