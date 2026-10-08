// "Reduce transparency" turns the glass off on the page: CSS cannot say it for
// every browser (Firefox and Safari may not know the media query), so the page
// asks and sets `data-glass="off"`. The light under the pointer is a second
// small chunk, fetched when a pointer first shows up.
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
  // The light under the pointer is fetched when a pointer first shows up, not on a timer: a page nobody touches (or one left mid-load) never asks for it.
  const start = () => {
    removeEventListener('pointermove', start)
    removeEventListener('pointerdown', start)
    void import('./glassHover').then((m) => m.startHover(), () => {}) // decoration: a failed download is no error
  }
  addEventListener('pointermove', start, { passive: true })
  addEventListener('pointerdown', start, { passive: true })
}
