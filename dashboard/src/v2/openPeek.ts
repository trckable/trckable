// Opens Peek (the Ask panel): the header's ghost, ⌘K's "Ask" and the key all say the same event; the build that has the panel listens.
// The panel can take a moment to arrive, so until it does (or a short while at most) the pointer shows that something is happening.
const WAIT = 1500
let timer: ReturnType<typeof setTimeout> | undefined

export function openPeek() {
  window.dispatchEvent(new Event('trckable:ask'))
  document.documentElement.dataset.peekOpening = ''
  document.documentElement.style.cursor = 'progress'
  clearTimeout(timer)
  timer = setTimeout(donePeek, WAIT)
}

/** The panel is up (or no longer coming): the pointer is as it was. */
export function donePeek() {
  clearTimeout(timer)
  delete document.documentElement.dataset.peekOpening
  document.documentElement.style.removeProperty('cursor')
}
