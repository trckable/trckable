// One screen becoming another as a single movement: where the browser has the
// View Transitions API, the old frame fades and settles while the new one
// rises in, and elements named alike in both (styles.css) morph between their
// places. Elsewhere the change is applied at once and the incoming view runs
// its own CSS entrance. Reduced motion: always the instant switch.
import { flushSync } from 'react-dom'
import { reducedMotion } from './motion'

// The fallback entrance's length (styles.css, view-in), plus a frame.
const FALLBACK_MS = 300

type Transition = { ready: Promise<void>; updateCallbackDone: Promise<void>; finished: Promise<void> }
type Doc = Document & { startViewTransition?: (update: () => void) => Transition }

/**
 * Applies `update` inside a view transition when one fits. It renders at once
 * (flushSync), so `after` sees the new page: the place to set its scroll.
 */
export function transition(update: () => void, after?: () => void): Promise<void> {
  const doc = document as Doc
  const run = () => {
    flushSync(update)
    after?.()
  }
  if (reducedMotion()) {
    run()
    return Promise.resolve()
  }
  if (typeof doc.startViewTransition !== 'function') {
    // The CSS fallback: the incoming view rises in (styles.css, [data-swap]).
    const root = document.documentElement
    root.dataset.swap = 'in'
    run()
    setTimeout(() => delete root.dataset.swap, FALLBACK_MS)
    return Promise.resolve()
  }
  // A transition already underway is skipped by the browser; ours takes over.
  const vt = doc.startViewTransition.call(doc, run)
  // A transition the browser skips (hidden tab, a newer one) still applies
  // the update; only the animation is lost, which is no error to report.
  vt.ready.catch(() => undefined)
  vt.updateCallbackDone.catch(() => undefined)
  return vt.finished.catch(() => undefined)
}
