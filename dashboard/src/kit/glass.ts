// "Reduce transparency" turns the glass off on the page: CSS cannot say it for
// every browser (Firefox and Safari may not know the media query), so the page
// asks and sets `data-glass="off"`. The light under the pointer is a second
// small chunk, fetched when the browser is idle.
import './glass.css'

export function startGlass() {
  const root = document.documentElement
  try {
    const less = matchMedia('(prefers-reduced-transparency: reduce)')
    const sync = () => (less.matches ? (root.dataset.glass = 'off') : delete root.dataset.glass)
    sync()
    less.addEventListener?.('change', sync)
  } catch {
    /* a browser without the query keeps the glass */
  }
  const later = (window as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 800))
  later(() => void import('./glassHover').then((m) => m.startHover()))
}
