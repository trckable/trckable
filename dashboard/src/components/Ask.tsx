// A small ghost on a card: "Ask about this". It hands the card's own words to the
// listener as a window event, so no card imports it; it draws only
// where a listener has said it is there (a mark on the page) and for people
// who may ask. Without one there is nothing to ask and nothing is drawn.
import { canAsk } from '../lib/me'
import { Ghost } from './Logo'

/** What a card says about itself: plain text, never markup. */
export interface AboutThis {
  /** What the card is: "Visitors", "Busy day, 3 Oct". */
  title: string
  /** What it shows, one fact each: "Visitors: 1,204", "Up 12% on the period before". */
  facts: string[]
  /** The question to ask about it. */
  question: string
  /** Left out, the site and period on screen are used. */
  domain?: string
  period?: string
}

const TIP = 'Ask about this'
/** A small ghost button of the product's own: the size is all this adds. */
const SIZE = { width: 28, height: 28, minHeight: 0, opacity: 0.75 }

export function AskAbout({ about }: { about: AboutThis }) {
  // A listener marks the page when it is there.
  if (!document.documentElement.hasAttribute('data-ask-about') || !canAsk()) return null
  return (
    <button
      type="button"
      className="btn ghost icon"
      style={SIZE}
      title={TIP}
      aria-label={`${TIP}: ${about.title}`}
      onClick={(e) => {
        e.stopPropagation()
        window.dispatchEvent(new CustomEvent('trckable:ask-about', { detail: about }))
      }}
    >
      <Ghost size={14} />
    </button>
  )
}
