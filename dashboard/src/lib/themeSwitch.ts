// Changing the theme while the page is up (lib/theme.ts): its own small chunk and stylesheet,
// fetched when a theme is first chosen, so the first load does not carry them.
import { reducedMotion } from './motion'
import './themeSwitch.css'

/** How long the fallback crossfade stays on (styles.css, data-theme-switch), plus a frame. */
export const FADE_MS = 260

type Doc = Document & { startViewTransition?: (update: () => void) => { finished: Promise<unknown> } }

/** Changing the theme while the page is up: a short crossfade, never a flash. Where the browser has View
 *  Transitions the page crossfades as one picture (nothing in it re-renders or re-animates); elsewhere
 *  colours are given a transition for the length of the switch only, then it is taken off, so normal
 *  interactions are not slowed. Reduced motion: at once. */
export function switchTheme(t: string, applyTheme: (t: string) => void) {
  const root = document.documentElement
  if (reducedMotion()) {
    applyTheme(t)
    return
  }
  const doc = document as Doc
  if (typeof doc.startViewTransition === 'function') {
    root.dataset.themeSwitch = 'view'
    const vt = doc.startViewTransition.call(doc, () => applyTheme(t))
    const done = () => delete root.dataset.themeSwitch
    vt.finished.then(done, done)
    return
  }
  root.dataset.themeSwitch = 'fade'
  applyTheme(t)
  setTimeout(() => delete root.dataset.themeSwitch, FADE_MS)
}
