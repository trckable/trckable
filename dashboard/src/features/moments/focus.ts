// "See it" always shows something: the chart comes into view and the moment's
// marker lights up for a moment, even when the click changed nothing in the
// address (the filter was already on, the day already picked).
import { reducedMotion } from '../../lib/motion'
import type { Pin } from './pins'

export const HIT = 'trckable:moment-hit'
/** How long a marker stays lit. */
export const HIT_MS = 2200
/** The address has changed and the chart is redrawing: the marker is lit once it is back. */
const SETTLE_MS = 350

export function focusMoment(pin: Pin) {
  const chart = document.querySelector('.overview-chart')
  chart?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' })
  setTimeout(() => window.dispatchEvent(new CustomEvent<string>(HIT, { detail: pin.id })), reducedMotion() ? 0 : SETTLE_MS)
}
