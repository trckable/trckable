// The light under the pointer (--mx and --my on the card it is over) and a short
// sheen on a touch. Delegated from the document, so every card has them.
import './glassHover.css'

const CARD = '.kit-card, .card, .me-card, .site-card, .all-card, .all-tile, .sv-setup, .sl-panel, .side-card'

export function startHover() {
  const still = matchMedia('(prefers-reduced-motion: reduce)')
  const aim = (e: PointerEvent) => {
    const card = (e.target as Element | null)?.closest?.<HTMLElement>(CARD)
    if (!card) return null
    const r = card.getBoundingClientRect()
    card.style.setProperty('--mx', `${e.clientX - r.left}px`)
    card.style.setProperty('--my', `${e.clientY - r.top}px`)
    return card
  }
  document.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'touch' && !still.matches) aim(e)
    },
    { passive: true },
  )
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch') return
      const card = aim(e)
      if (!card) return
      card.classList.add('glass-lit')
      setTimeout(() => card.classList.remove('glass-lit'), 420)
    },
    { passive: true },
  )
}
