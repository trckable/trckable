// A short sheen on a touch (the hover light itself is pure CSS, in the card's
// top right corner). Delegated from the document, so every card has it.
import './glassHover.css'

const CARD = '.kit-card, .card, .me-card, .site-card, .all-card, .all-tile, .sv-setup, .sl-panel, .side-card'

export function startHover() {
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch') return
      const card = (e.target as Element | null)?.closest?.<HTMLElement>(CARD)
      if (!card) return
      card.classList.add('glass-lit')
      setTimeout(() => card.classList.remove('glass-lit'), 420)
    },
    { passive: true },
  )
}
